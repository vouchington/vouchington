import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function setTopicBestSortInputs(topicId: string, score4: number): Promise<void> {
  await write(sql`
    UPDATE topic_metrics
    SET ratings__score__4 = ${score4},
      ratings__count__4 = ${Math.round(score4)},
      ratings__updated_at = CURRENT_TIMESTAMP
    WHERE topic_id = ${topicId}
  `)
}

export async function refreshTestTopicBookmarkStats(topicId: string): Promise<void> {
  await write(sql`
    /* refreshTestTopicBookmarkStats */
    SELECT fn_update_topic_bookmark_stats_for_topic_id(${topicId})
  `)
}

export async function insertTestTopicMetricsBatch(topicIds: readonly string[]): Promise<void> {
  if (topicIds.length === 0) return
  await write(sql`
    /* insertTestTopicMetricsBatch */
    INSERT INTO topic_metrics (topic_id)
    SELECT topic_id FROM UNNEST(${topicIds}::uuid[]) AS input(topic_id)
    ON CONFLICT (topic_id) DO NOTHING
  `)
}
