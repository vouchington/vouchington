import { read, withTransactionOptions, write, type QueryOptions } from '@data-stores/psql'
import { lockActiveUserSubjectsForMutation } from '@services/user-deletions/active-user-mutation-lock'
import sql from 'sql-template-strings'
import { getBlueskyFollowsWorkLimit } from './work-limits.mts'

// CRUD on bluesky_follow_records (see migrations/0571-00-00-bluesky-follow-records.sql). A row is
// Voucha's durable receipt that a live app.bsky.graph.follow record currently exists on Bluesky for
// this pair — not a cache of Bluesky state, the source of truth for "does it exist." Bluesky's PDS
// mints the record_uri's rkey server-side (see the migration's header comment), so this table can
// never be pre-populated speculatively — only saved after a successful createRecord.
export interface BlueskyFollowReceipt {
  follower_user_id: string
  followee_user_id: string
  follower_bluesky_did: string
  follower_account_link_authorization_id: string
  record_uri: string
  created_at: Date
}

export async function getBlueskyFollowReceipt(
  followerUserId: string,
  followeeUserId: string,
  followerBlueskyDid: string,
  followerAuthorizationId: string,
  options: QueryOptions = {},
): Promise<BlueskyFollowReceipt | null> {
  const { rows } = await read(
    sql`/* getBlueskyFollowReceipt */
      SELECT receipt.follower_user_id, receipt.followee_user_id,
             account.bluesky_did AS follower_bluesky_did,
             receipt.follower_account_link_authorization_id, receipt.record_uri, receipt.created_at
      FROM bluesky_follow_records receipt
      JOIN bluesky_linked_accounts account
        ON account.link_authorization_id = receipt.follower_account_link_authorization_id
      WHERE receipt.follower_user_id = ${followerUserId}
        AND receipt.followee_user_id = ${followeeUserId}
        AND account.bluesky_did = ${followerBlueskyDid}
        AND receipt.follower_account_link_authorization_id = ${followerAuthorizationId}`,
    options,
  )
  return (rows[0] as BlueskyFollowReceipt | undefined) ?? null
}

export async function saveBlueskyFollowReceipt(
  followerUserId: string,
  followeeUserId: string,
  followerBlueskyDid: string,
  followerAuthorizationId: string,
  recordUri: string,
  options: QueryOptions = {},
): Promise<void> {
  await withTransactionOptions(options, async query => {
    await lockActiveUserSubjectsForMutation(query, [followerUserId, followeeUserId])
    const { rowCount } = await query(sql`/* saveBlueskyFollowReceipt */
      INSERT INTO bluesky_follow_records (
        follower_user_id, followee_user_id, follower_account_link_authorization_id, record_uri
      )
      SELECT ${followerUserId}, ${followeeUserId}, account.link_authorization_id, ${recordUri}
      FROM bluesky_linked_accounts account
      WHERE account.link_authorization_id = ${followerAuthorizationId}
        AND account.bluesky_did = ${followerBlueskyDid}
        AND account.user_id = ${followerUserId}
      ON CONFLICT (follower_user_id, followee_user_id)
        DO UPDATE SET
          follower_account_link_authorization_id = EXCLUDED.follower_account_link_authorization_id,
          record_uri = EXCLUDED.record_uri`)
    if (rowCount !== 1) throw new Error('Exact Bluesky account generation is missing')
  })
}

export async function deleteBlueskyFollowReceipt(
  followerUserId: string,
  followeeUserId: string,
  followerBlueskyDid: string,
  followerAuthorizationId: string,
  options: QueryOptions = {},
): Promise<void> {
  await write(
    sql`/* deleteBlueskyFollowReceipt */
      DELETE FROM bluesky_follow_records receipt
      USING bluesky_linked_accounts account
      WHERE receipt.follower_user_id = ${followerUserId}
        AND receipt.followee_user_id = ${followeeUserId}
        AND receipt.follower_account_link_authorization_id = ${followerAuthorizationId}
        AND account.link_authorization_id = receipt.follower_account_link_authorization_id
        AND account.bluesky_did = ${followerBlueskyDid}`,
    options,
  )
}

// Rows where followerUserId is the follower — the only receipts that user can actually act on via
// the AT Protocol API, since an app.bsky.graph.follow record always lives in its creator's
// (follower's) own repo and deleteFollowOnBluesky authenticates as that repo. Read by
// disconnect.mts before it revokes the session, so it can delete the real Bluesky records before
// dropping their local receipts.
export async function listBlueskyFollowReceiptsForFollower(
  followerUserId: string,
  followerBlueskyDid: string,
  followerAuthorizationId: string,
  cursor: string | null,
  options: QueryOptions = {},
): Promise<BlueskyFollowReceipt[]> {
  const { rows } = await read(
    sql`/* listBlueskyFollowReceiptsForFollower */
      SELECT receipt.follower_user_id, receipt.followee_user_id,
             account.bluesky_did AS follower_bluesky_did,
             receipt.follower_account_link_authorization_id, receipt.record_uri, receipt.created_at
      FROM bluesky_follow_records receipt
      JOIN bluesky_linked_accounts account
        ON account.link_authorization_id = receipt.follower_account_link_authorization_id
      WHERE receipt.follower_user_id = ${followerUserId}
        AND account.bluesky_did = ${followerBlueskyDid}
        AND receipt.follower_account_link_authorization_id = ${followerAuthorizationId}
        AND (${cursor}::uuid IS NULL OR receipt.followee_user_id > ${cursor}::uuid)
      ORDER BY receipt.followee_user_id
      LIMIT ${getBlueskyFollowsWorkLimit('backfill_batch_size')}`,
    options,
  )
  return rows as BlueskyFollowReceipt[]
}

// Sorts before every UUID, so the first page needs no separate "no cursor" predicate.
export const START_OF_IDS = '00000000-0000-0000-0000-000000000000'

// Clears one keyset page of receipts where followeeUserId is followed by a different user. Those
// records live in the other follower's repo, so followeeUserId cannot delete them remotely. A
// self-follow receipt is excluded because followeeUserId also owns that remote record;
// disconnect.mts deletes it through the follower cleanup before dropping the local receipt. A
// full page (`hasMore`) means more may remain after `lastFollowerUserId`; the caller continues
// through the drain job (drain-followee-receipts.mts), never a loop here.
// The page rows are locked in the CTE, so their ctids stay valid for the delete in this statement;
// deleting by ctid keeps the delete on the page instead of re-joining the whole table.
export async function deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowersPage(
  followeeUserId: string,
  afterFollowerUserId: string,
  options: QueryOptions = {},
): Promise<{ lastFollowerUserId: string | null; hasMore: boolean }> {
  const batchSize = getBlueskyFollowsWorkLimit('backfill_batch_size')
  const { rows } = await write(
    sql`/* deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowersPage */
      WITH page AS MATERIALIZED (
        SELECT ctid AS row_id
        FROM bluesky_follow_records
        WHERE followee_user_id = ${followeeUserId}
          AND follower_user_id <> ${followeeUserId}
          AND follower_user_id > ${afterFollowerUserId}::uuid
        ORDER BY follower_user_id
        LIMIT ${batchSize}
        FOR UPDATE
      )
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
