import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function lockOwnedBlueskyReceiptsForTest(
  query: QueryExecutor,
  followerIds: string[],
  followeeId: string,
): Promise<void> {
  await query(sql`/* lockOwnedBlueskyReceiptsForTest */
    SELECT follower_user_id FROM bluesky_follow_records
    WHERE follower_user_id = ANY(${followerIds}::uuid[]) AND followee_user_id = ${followeeId}
    FOR UPDATE
  `)
}

/** The native wait witness precedes this one-shot lookup of the cleanup's selected tuple. */
export async function getWaitedBlueskyReceiptFollowerForTest(
  query: QueryExecutor,
  cleanupProcessId: number,
  followerIds: string[],
  followeeId: string,
): Promise<string> {
  const { rows } = await query<{
    follower_user_id: string
  }>(sql`/* getWaitedBlueskyReceiptFollowerForTest */
    SELECT receipt.follower_user_id
    FROM pg_locks tuple_lock
    JOIN bluesky_follow_records receipt
      ON receipt.ctid = format('(%s,%s)', tuple_lock.page, tuple_lock.tuple)::tid
    WHERE tuple_lock.pid = ${cleanupProcessId} AND tuple_lock.locktype = 'tuple'
      AND tuple_lock.relation = 'bluesky_follow_records'::regclass AND tuple_lock.granted
      AND receipt.follower_user_id = ANY(${followerIds}::uuid[])
      AND receipt.followee_user_id = ${followeeId}
    LIMIT 2
  `)
  if (rows.length !== 1 || !rows[0])
    throw new Error('Expected one owned Bluesky receipt tuple held by the waiting cleanup')
  return rows[0].follower_user_id
}
