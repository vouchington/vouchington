import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getBlueskyFollowsWorkLimit } from './work-limits.mts'

// Clears one keyset page of receipts where followeeUserId is followed by a different user. Those
// records live in the other follower's repo, so followeeUserId cannot delete them remotely. A
// self-follow receipt is excluded because followeeUserId also owns that remote record;
// disconnect.mts deletes it through the follower cleanup before dropping the local receipt. A
// full page (`hasMore`) may leave more; the disconnect job resumes after `lastFollowerUserId`, never in a loop here.
// The page rows are locked in the CTE, so their ctids stay valid for the delete in this statement;
// deleting by ctid keeps the delete on the page instead of re-joining the whole table.
// The exact account generation guard sits in the deleting statement itself, so it shares the
// statement's snapshot: a paused run whose generation was revoked selects nothing and cannot see
// receipts saved after revoke + relink. No lock on the unwritten account row is needed.
export async function deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowersPage(
  followeeUserId: string,
  generation: { blueskyDid: string; linkAuthorizationId: string },
  afterFollowerUserId: string,
  options: QueryOptions = {},
): Promise<{ lastFollowerUserId: string | null; hasMore: boolean }> {
  const batchSize = getBlueskyFollowsWorkLimit('backfill_batch_size')
  // The closed range selects one followee while preserving the reverse index's ordering key.
  const { rows } = await write(
    sql`/* deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowersPage */
      WITH page AS MATERIALIZED (
        SELECT ctid AS row_id
        FROM bluesky_follow_records
        WHERE EXISTS (
            SELECT 1
            FROM bluesky_linked_accounts
            WHERE user_id = ${followeeUserId}
              AND bluesky_did = ${generation.blueskyDid}
              AND link_authorization_id = ${generation.linkAuthorizationId}
          )
          AND followee_user_id >= ${followeeUserId}::uuid
          AND followee_user_id <= ${followeeUserId}::uuid
          AND follower_user_id <> ${followeeUserId}
          AND follower_user_id > ${afterFollowerUserId}::uuid
        ORDER BY followee_user_id, follower_user_id
        LIMIT ${batchSize}
        FOR UPDATE
      )
      -- no-mistakes-disable-next-line postgres-bounded-statements -- locked page selects at most the runtime backfill_batch_size (hard ceiling blueskyFollowsWorkMaxValues.backfill_batch_size); ctid membership deletes only those rows and the disconnect job persists the follower cursor
      DELETE FROM bluesky_follow_records
      WHERE ctid = ANY (ARRAY(SELECT row_id FROM page))
      RETURNING follower_user_id`,
    options,
  )
  const followerIds = (rows as { follower_user_id: string }[]).map(row => row.follower_user_id)
  return {
    lastFollowerUserId: followerIds.length > 0 ? followerIds.toSorted().at(-1)! : null,
    hasMore: followerIds.length === batchSize,
  }
}
