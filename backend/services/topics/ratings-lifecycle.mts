import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Fence retained projection work before its rating lock so a merge can clear source metrics. */
export async function lockActiveTopicForRatingStatsRefresh(
  query: TransactionQuery,
  topicId: string,
): Promise<boolean> {
  await query(
    sql`/* lockTopicRatingStatsLifecycle */ SELECT pg_advisory_xact_lock_shared(hashtextextended(${`topic-rss-feed-attachment:${topicId}`}, 0))`,
  )
  const { rowCount } = await query(sql`/* getActiveTopicForRatingStatsRefresh */
    SELECT id FROM topics WHERE id = ${topicId} AND deleted_at IS NULL AND merged_into_topic_id IS NULL
  `)
  if (!rowCount) return false
  await query(
    sql`/* lockTopicRatingStatsRefresh */ SELECT pg_advisory_xact_lock(hashtextextended(${`topic-rating:${topicId}`}, 0))`,
  )
  return true
}
