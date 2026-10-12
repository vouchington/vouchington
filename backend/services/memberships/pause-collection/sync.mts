import {
  getStripeSubscription,
  updateStripeSubscriptionPauseCollection,
} from '@modules/stripe/subscriptions'
import { getManageableStripeSubscriptionByUserId } from '../management/get-manageable-stripe-subscription.mts'
import {
  claimMembershipPauseCollection,
  completeMembershipPauseCollection,
  confirmMembershipPauseCollectionLease,
  membershipPauseCollectionLeaseHeld,
  releaseMembershipPauseCollection,
  type PauseCollectionClaim,
} from './work.mts'

const TERMINAL_SUBSCRIPTION_STATUSES = new Set(['canceled', 'incomplete_expired'])

export type SyncMembershipPauseCollectionInput = {
  userId: string
  requestedAt: string
  leaseToken?: string
}

/**
 * Makes the direct Stripe subscription's pause_collection match the open suspension.
 * The membership projection stays active; pause_collection is not a paused membership.
 * Missing and already-cancelled subscriptions are no-ops.
 */
export async function syncMembershipPauseCollection(
  input: SyncMembershipPauseCollectionInput,
): Promise<void> {
  const claimed = await claimForSync(input)
  if (!claimed) return
  const owned = { ...input, leaseToken: claimed.leaseToken }
  try {
    const outcome = await applyPauseCollection(owned, claimed.suspended)
    if (outcome === 'superseded') return
    await completeMembershipPauseCollection(owned)
  } catch (err) {
    await releaseMembershipPauseCollection(owned)
    throw err
  }
}

async function claimForSync(
  input: SyncMembershipPauseCollectionInput,
): Promise<PauseCollectionClaim | null> {
  if (input.leaseToken) {
    return confirmMembershipPauseCollectionLease({
      userId: input.userId,
      requestedAt: input.requestedAt,
      leaseToken: input.leaseToken,
    })
  }
  return claimMembershipPauseCollection(input)
}

type PauseCollectionOutcome = 'applied' | 'superseded'
type OwnedLease = { userId: string; requestedAt: string; leaseToken: string }

async function applyPauseCollection(
  input: OwnedLease,
  suspended: boolean,
): Promise<PauseCollectionOutcome> {
  const subscriptionId = await loadDirectSubscriptionId(input)
  if (subscriptionId === 'superseded') return 'superseded'
  if (!subscriptionId) return 'applied'
  const desired = suspended ? 'void' : 'clear'
  const subscription = await readStripeSubscription(subscriptionId)
  if (!subscription || TERMINAL_SUBSCRIPTION_STATUSES.has(subscription.status)) return 'applied'
  if (pauseCollectionMatches(subscription.pause_collection, desired)) return 'applied'
  return sendPauseCollection(input, subscriptionId, desired)
}

async function loadDirectSubscriptionId(input: OwnedLease): Promise<string | 'superseded' | null> {
  if (!(await membershipPauseCollectionLeaseHeld(input))) return 'superseded'
  const manageable = await getManageableStripeSubscriptionByUserId(input.userId)
  return manageable?.subscriptionId ?? null
}

async function sendPauseCollection(
  input: OwnedLease,
  subscriptionId: string,
  desired: 'void' | 'clear',
): Promise<PauseCollectionOutcome> {
  if (!(await membershipPauseCollectionLeaseHeld(input))) return 'superseded'
  await updateStripeSubscriptionPauseCollection(
    subscriptionId,
    desired,
    pauseCollectionIdempotencyKey(input, subscriptionId, desired),
  )
  return 'applied'
}

function pauseCollectionIdempotencyKey(
  input: { userId: string; requestedAt: string },
  subscriptionId: string,
  desired: 'void' | 'clear',
): string {
  return `membership-pause-collection:${input.userId}:${input.requestedAt}:${subscriptionId}:${desired}`
}

function pauseCollectionMatches(
  pause: { behavior?: string; resumes_at?: number | null } | null | undefined,
  desired: 'void' | 'clear',
): boolean {
  if (desired === 'clear') return pause == null
  return pause?.behavior === 'void' && pause.resumes_at == null
}

async function readStripeSubscription(subscriptionId: string): Promise<{
  status: string
  pause_collection?: { behavior?: string; resumes_at?: number | null } | null
} | null> {
  try {
    return await getStripeSubscription(subscriptionId)
  } catch (err) {
    if (isMissingStripeSubscription(err)) return null
    throw err
  }
}

function isMissingStripeSubscription(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { code?: string }).code === 'resource_missing'
  )
}
