import { hasPlusTier } from '@modules/membership-helpers'
import { enqueueRemoveUnfurledChildrenForUserBestEffort } from '@queues/unfurl-referral-links/enqueues'
import type { MembershipLifecycleFields, MembershipUpdateResult } from './update-result.mts'

/**
 * Decision #4's eager-removal half (see the referral-link-unfurl plan): fires when an event-driven
 * update moves the user OFF Plus/Pro. This is cleanup, not the source of truth -- a granted/comp
 * membership lapsing purely by `expires_at` fires no event and never reaches here, which is why
 * the query-time filter (`childVisibilitySql`) is the authoritative check.
 */
function didLosePaidTier(
  previous: MembershipLifecycleFields,
  current: MembershipLifecycleFields,
): boolean {
  return hasPlusTier(previous) && !hasPlusTier(current)
}

export function enqueueUnfurledChildRemovalOnDowngrade(
  membership: MembershipUpdateResult,
  retainsPaidAccess = false,
): Promise<void> {
  if (!retainsPaidAccess && didLosePaidTier(membership.previous, membership.current))
    return enqueueRemoveUnfurledChildrenForUserBestEffort(membership.current.user_id)
  return Promise.resolve()
}
