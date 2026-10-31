import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function setTestRssFeedItemCategoryTopicId(
  rssFeedItemId: string,
  categoryText: string,
  topicId: string | null,
): Promise<void> {
  await write(
    sql`/* setTestRssFeedItemCategoryTopicId */
    UPDATE rss_feed_item_categories
    SET topic_id = ${topicId}
    WHERE rss_feed_item_id = ${rssFeedItemId}
      AND category_identity_id = (
        SELECT id FROM rss_category_identities WHERE category_text = LOWER(TRIM(${categoryText}))
      )
  `,
  )
}

export async function getTestRssFeedItemCategories(rssFeedItemId: string) {
  const { rows } = await read<{
    rss_feed_item_id: string
    category_text: string
    topic_id: string | null
    created_at: Date
    updated_at: Date
  }>(
    `/* getTestRssFeedItemCategories */
      SELECT rss_feed_item_id, category_text, topic_id, created_at, updated_at
      FROM rss_feed_item_categories
      WHERE rss_feed_item_id = $1`,
    [rssFeedItemId],
  )
  return rows
}

export async function countTestRssFeedItemAliasCategoryBindings(
  aliasId: string,
  itemIds: string[],
): Promise<number> {
  const { rows } = await read<{ count: string }>(
    `/* countTestRssFeedItemAliasCategoryBindings */
     SELECT COUNT(*)::text AS count FROM rss_feed_item_categories
     WHERE topic_alias_id = $1::uuid AND rss_feed_item_id = ANY($2::uuid[])`,
    [aliasId, itemIds],
  )
  return Number(rows[0]?.count ?? 0)
}
