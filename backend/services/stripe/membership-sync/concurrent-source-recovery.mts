import { getMembershipByStripeSubscriptionId } from '@services/memberships'
import type {
  StripeMembershipApplicationContext,
  StripeMembershipSourceIdentity,
} from '@services/memberships/create-types'
import { syncMembershipFromStripeSubscription } from './sync-existing.mts'

export async function recoverConcurrentStripeMembershipSource(
  error: unknown,
  options: {
    eventId: string
    subscriptionId: string
    sourceIdentity: StripeMembershipSourceIdentity
    applicationContext: StripeMembershipApplicationContext
  },
): Promise<boolean> {
  if (!isUniqueConstraintError(error)) return false
  const membership = await getMembershipByStripeSubscriptionId(options.sourceIdentity)
  if (!membership) return false
  await syncMembershipFromStripeSubscription(
    options.eventId,
    options.subscriptionId,
    options.applicationContext,
  )
  return true
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as { code: string }).code === '23505'
}
