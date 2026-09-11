import { read, beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 } from 'uuid'

export async function insertTestBlueskyFollowReceipt(
  followerUserId: string,
  followeeUserId: string,
): Promise<void> {
  await write(sql`/* insertTestBlueskyFollowReceipt */
    INSERT INTO bluesky_follow_records (
      follower_user_id, followee_user_id, follower_bluesky_did,
      follower_authorization_id, record_uri
    )
    SELECT
      ${followerUserId},
      ${followeeUserId},
      bluesky_did,
      link_authorization_id,
      ${`at://did:plc:test/app.bsky.graph.follow/${v7().replaceAll('-', '')}`}
    FROM bluesky_linked_accounts
    WHERE user_id = ${followerUserId}`)
}

export async function countTestBlueskyFollowReceiptsForUser(userId: string): Promise<number> {
  const { rows } = await read<{ count: string }>(sql`/* countTestBlueskyFollowReceiptsForUser */
    SELECT COUNT(*)::text AS count
    FROM bluesky_follow_records
    WHERE follower_user_id = ${userId} OR followee_user_id = ${userId}`)
  return Number(rows[0]?.count ?? 0)
}

export async function acquireTestUserAdvisoryLock(userId: string): Promise<{
  release: () => void
  completed: Promise<void>
}> {
  let markAcquired: () => void = () => undefined
  let releaseLock: () => void = () => undefined
  const acquired = new Promise<void>(resolve => {
    markAcquired = resolve
  })
  const released = new Promise<void>(resolve => {
    releaseLock = resolve
  })
  const completed = holdUserAdvisoryLock()

  async function holdUserAdvisoryLock(): Promise<void> {
    await using transaction = await beginTransaction()
    await transaction(sql`/* acquireTestUserAdvisoryLock */
        SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`)
    markAcquired()
    await released
    await transaction.commit()
  }
  await acquired
  return { release: releaseLock, completed }
}
