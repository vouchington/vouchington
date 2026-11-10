import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function holdTopicRatingRefreshLock(
  _topicId: string,
  onAcquired: () => Promise<void>,
): Promise<void> {
  {
    await using transaction = await beginTransaction()
    await onAcquired()
    await transaction.commit()
  }
}

export async function isTopicRatingRefreshWaiting(): Promise<boolean> {
  const result = await write<{ waiting: boolean }>(sql`/* isTopicRatingRefreshWaiting */
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
