import { read, withTransactionOptions, write, type QueryOptions } from '@data-stores/psql'
import { lockActiveUserSubjectsForMutation } from '@services/user-deletions/active-user-mutation-lock'
import sql from 'sql-template-strings'

// CRUD on bluesky_follow_records (see migrations/0571-00-00-bluesky-follow-records.sql). A row is
// Voucha's durable receipt that a live app.bsky.graph.follow record currently exists on Bluesky for
// this pair — not a cache of Bluesky state, the source of truth for "does it exist." Bluesky's PDS
// mints the record_uri's rkey server-side (see the migration's header comment), so this table can
// never be pre-populated speculatively — only saved after a successful createRecord.
export interface BlueskyFollowReceipt {
  follower_user_id: string
  followee_user_id: string
  follower_bluesky_did: string
  follower_authorization_id: string
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
      SELECT follower_user_id, followee_user_id, follower_bluesky_did,
             follower_authorization_id, record_uri, created_at
      FROM bluesky_follow_records
      WHERE follower_user_id = ${followerUserId}
        AND followee_user_id = ${followeeUserId}
        AND follower_bluesky_did = ${followerBlueskyDid}
        AND follower_authorization_id = ${followerAuthorizationId}`,
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
    await query(sql`/* saveBlueskyFollowReceipt */
      INSERT INTO bluesky_follow_records (
        follower_user_id, followee_user_id, follower_bluesky_did,
        follower_authorization_id, record_uri
      )
      VALUES (
        ${followerUserId}, ${followeeUserId}, ${followerBlueskyDid},
        ${followerAuthorizationId}, ${recordUri}
      )
      ON CONFLICT (follower_user_id, followee_user_id)
        DO UPDATE SET
          follower_bluesky_did = EXCLUDED.follower_bluesky_did,
          follower_authorization_id = EXCLUDED.follower_authorization_id,
          record_uri = EXCLUDED.record_uri`)
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
      DELETE FROM bluesky_follow_records
      WHERE follower_user_id = ${followerUserId}
        AND followee_user_id = ${followeeUserId}
        AND follower_bluesky_did = ${followerBlueskyDid}
        AND follower_authorization_id = ${followerAuthorizationId}`,
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
  options: QueryOptions = {},
): Promise<BlueskyFollowReceipt[]> {
  const { rows } = await read(
    sql`/* listBlueskyFollowReceiptsForFollower */
      SELECT follower_user_id, followee_user_id, follower_bluesky_did,
             follower_authorization_id, record_uri, created_at
      FROM bluesky_follow_records
      WHERE follower_user_id = ${followerUserId}
        AND follower_bluesky_did = ${followerBlueskyDid}
        AND follower_authorization_id = ${followerAuthorizationId}`,
    options,
  )
  return rows as BlueskyFollowReceipt[]
}

// Clears receipts where followeeUserId is followed by a different user. Those records live in the
// other follower's repo, so followeeUserId cannot delete them remotely. A self-follow receipt is
// excluded because followeeUserId also owns that remote record; disconnect.mts deletes it through
// the follower cleanup before dropping the local receipt.
export async function deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowers(
  followeeUserId: string,
  options: QueryOptions = {},
): Promise<void> {
  await write(
    sql`/* deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowers */
      DELETE FROM bluesky_follow_records
      WHERE followee_user_id = ${followeeUserId}
        AND follower_user_id <> ${followeeUserId}`,
    options,
  )
}

// Clears every receipt referencing userId in either role during full user deletion. Ordinary
// unlink relies on the exact account-generation foreign key for follower-role cleanup and the
// explicit other-follower cleanup above.
export async function deleteBlueskyFollowReceiptsForUser(
  userId: string,
  options: QueryOptions = {},
): Promise<void> {
  await write(
    sql`/* deleteBlueskyFollowReceiptsForUser */
      DELETE FROM bluesky_follow_records
      WHERE follower_user_id = ${userId} OR followee_user_id = ${userId}`,
    options,
  )
}
