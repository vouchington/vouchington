import { write } from '../fixture-executor.mts'
import sql from '../fixture-sql.mts'

export async function addScoredCategoryTopicRelationToRssFeedItem(
  rssFeedItemId: string,
  topicId: string,
): Promise<void> {
  await write(sql`
    INSERT INTO relation__rss_feed_item__category__topic (
      subject_id,
      object_id,
      votes_score_up,
      votes_count_up
    ) VALUES (${rssFeedItemId}, ${topicId}, 1, 1)
    ON CONFLICT (subject_id, object_id) DO UPDATE SET
      votes_score_up = EXCLUDED.votes_score_up,
      votes_count_up = EXCLUDED.votes_count_up,
      deleted_at = NULL
  `)
}
