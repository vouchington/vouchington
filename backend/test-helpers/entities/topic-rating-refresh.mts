import { beginTransaction } from '@data-stores/psql'
import { write } from '../fixture-executor.mts'
import sql from '../fixture-sql.mts'

export async function holdTopicRatingRefreshLock(
  topicId: string,
  onAcquired: () => Promise<void>,
): Promise<void> {
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`topic-rating:${topicId}`}, 0))`,
    )
    await onAcquired()
    await transaction.commit()
  }
}

export async function isTopicRatingRefreshWaiting(): Promise<boolean> {
  const result = await write<{ waiting: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1
      FROM pg_stat_activity
      WHERE pid <> pg_backend_pid()
        AND state = 'active'
        AND wait_event = 'advisory'
        AND query LIKE '%lockTopicRatingStatsRefresh%'
    ) AS waiting
  `)
  return result.rows[0]?.waiting ?? false
}
