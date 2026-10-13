import type { PrivateUser } from './types.mts'

/**
 * The plan of a user loaded for this request (from auth or `requirePrivateToolUser`), read from
 * `view_current_paid_memberships` on that load. Use `getUserActivePlan` for any other user.
 */
export function getLoadedMembershipPlan(
  user: Pick<PrivateUser, 'membership_plan'>,
): NonNullable<PrivateUser['membership_plan']> | null {
  return user.membership_plan ?? null
}
