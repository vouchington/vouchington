import type { TransactionQuery } from '@data-stores/psql'

/** Retire a bounded active Follow page before its local target is finally purged. */
export async function terminalizePurgedUserRemoteFollows(
  query: TransactionQuery,
  userId: string,
  batchSize: number,
): Promise<number> {
  const { rowCount } = await query(
    `/* terminalizePurgedUserRemoteFollows */
     WITH candidates AS MATERIALIZED (
       SELECT id FROM activitypub_remote_follow_activities
       WHERE target_user_id = $1::uuid AND undone_at IS NULL
       ORDER BY id LIMIT $2 FOR UPDATE
     )
     UPDATE activitypub_remote_follow_activities activity
     SET undone_at = clock_timestamp()
     FROM candidates WHERE activity.id = candidates.id AND activity.undone_at IS NULL`,
    [userId, batchSize],
  )
  return rowCount ?? 0
}
