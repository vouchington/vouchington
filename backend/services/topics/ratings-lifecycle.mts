import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Fence retained projection work before its rating lock so a merge can clear source metrics. */
export async function lockActiveTopicForRatingStatsRefresh(
  query: TransactionQuery,
  topicId: string,
): Promise<boolean> {
  const { rowCount } = await query(sql`/* getActiveTopicForRatingStatsRefresh */
    SELECT id FROM topics WHERE id = ${topicId} AND deleted_at IS NULL AND merged_into_topic_id IS NULL
  `)
  if (!rowCount) return false
  // A merge can commit the redirect while this refresher waits for the rating key.
  const { rowCount: stillActive } = await query(sql`/* recheckActiveTopicForRatingStatsRefresh */
    SELECT id FROM topics WHERE id = ${topicId} AND deleted_at IS NULL AND merged_into_topic_id IS NULL
  `)
  return Boolean(stillActive)
}
