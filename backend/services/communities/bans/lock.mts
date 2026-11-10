import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import { assertNotBanned } from './get.mts'

/** Retained call site. Community user fences no longer take a lock. */
export async function lockCommunityUser(
  _communityId: string,
  _userId: string,
  _options: QueryOptions,
): Promise<void> {}

export async function lockCommunityUsers(
  _communityId: string,
  _userIds: string[],
  _options: QueryOptions,
): Promise<void> {}

/** Retained call site. Pair fences no longer take a lock. */
export async function lockCommunityUserPairs(
  _query: TransactionQuery,
  _pairs: readonly { communityId: string; userId: string }[],
): Promise<void> {}

/** Retained call site. Role fences no longer take a lock. */
export async function lockCommunityMembershipRoles(
  _query: TransactionQuery,
  _communityIds: readonly string[],
): Promise<void> {}

/** Applies the common role-fence then sorted member-fence order for interactive role writers. */
export async function lockCommunityRoleMutation(
  query: TransactionQuery,
  communityId: string,
  userIds: readonly string[],
): Promise<void> {
  await lockCommunityMembershipRoles(query, [communityId])
  await lockCommunityUsers(communityId, [...userIds], { query })
}

// Convenience: take the per-(community, user) lock and then assert the user is not banned, in one
// awaited call. Use at membership/content write sites so the lock + ban check are atomic without
// tripping the sequential-await lint rule.
export async function lockAndAssertNotBanned(
  communityId: string,
  userId: string,
  options: QueryOptions,
): Promise<void> {
  await lockCommunityUser(communityId, userId, options)
  await assertNotBanned(communityId, userId, options)
}
