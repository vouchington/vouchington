import { write } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { assertNotBanned } from './get.mts'

// Serializes ban issuance against membership/post creation for the same (community, user) pair.
// Every transaction that either issues a ban or grants membership / creates community content for
// a user takes this transaction-scoped advisory lock first, so a ban and a concurrent join/redeem/
// approval/post can no longer interleave their check-then-write and leave a banned user active.
// Must be called inside a transaction (pass the transaction's `options`); the lock releases on
// commit/rollback.
export async function lockCommunityUser(
  communityId: string,
  userId: string,
  options: QueryOptions,
): Promise<void> {
  await write(
    sql`/* lockCommunityUser */
    SELECT pg_advisory_xact_lock(hashtextextended(${communityId} || ':' || ${userId}, 0))
    `,
    options,
  )
}

export async function lockCommunityUsers(
  communityId: string,
  userIds: string[],
  options: QueryOptions,
): Promise<void> {
  const sortedUserIds = [...new Set(userIds)].toSorted()
  if (sortedUserIds.length === 0) return
  await write(
    sql`/* lockCommunityUsers */
      WITH ordered_users AS MATERIALIZED (
        SELECT user_id
        FROM unnest(${sortedUserIds}::uuid[]) AS input(user_id)
        ORDER BY user_id
      )
      SELECT pg_advisory_xact_lock(hashtextextended(${communityId} || ':' || user_id, 0))
      FROM ordered_users
      ORDER BY user_id
    `,
    options,
  )
}

/** Serializes membership role changes with purge succession decisions for each community. */
export async function lockCommunityMembershipRoles(
  query: TransactionQuery,
  communityIds: readonly string[],
): Promise<void> {
  const sortedCommunityIds = [...new Set(communityIds)].toSorted()
  if (sortedCommunityIds.length === 0) return
  await query(
    sql`/* lockCommunityMembershipRoles */
      SELECT pg_advisory_xact_lock(hashtextextended('community-membership-role:' || ordered.community_id::text, 0))
      FROM (
        SELECT unnest(${sortedCommunityIds}::uuid[]) AS community_id
        ORDER BY community_id
      ) ordered
    `,
  )
}

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
