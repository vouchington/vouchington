import { write } from '../fixture-executor.mts'
import sql from '../fixture-sql.mts'

export async function setTestRssFeedItemCategoryTopicId(
  rssFeedItemId: string,
  categoryText: string,
  topicId: string | null,
): Promise<void> {
  await write(sql`
    UPDATE rss_feed_item_categories
    SET topic_id = ${topicId}
    WHERE rss_feed_item_id = ${rssFeedItemId} AND category_text = ${categoryText}
  `)
}
