import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function insertTestRssFeedCategory(
  rssFeedId: string,
  categoryText: string,
  topicId: string,
): Promise<void> {
  await write(sql`
    INSERT INTO rss_feed_categories (rss_feed_id, category_text, topic_id)
    VALUES (${rssFeedId}, ${categoryText}, ${topicId})
    ON CONFLICT (rss_feed_id, category_text) DO UPDATE SET topic_id = EXCLUDED.topic_id
  `)
}

export async function getTestRssFeedCategories(
  rssFeedId: string,
): Promise<Array<{ category_text: string; topic_id: string | null }>> {
  const { rows } = await read<{ category_text: string; topic_id: string | null }>(sql`
    SELECT category_text, topic_id
    FROM rss_feed_categories
    WHERE rss_feed_id = ${rssFeedId}
    ORDER BY category_text
  `)
  return rows
}

export async function clearTestRssFeedItemCategoryTopicAlias(
  rssFeedItemId: string,
  categoryText: string,
): Promise<void> {
  await write(sql`
    UPDATE rss_feed_item_categories
    SET topic_alias_id = NULL
    WHERE rss_feed_item_id = ${rssFeedItemId}
      AND LOWER(category_text) = LOWER(${categoryText})
  `)
}
