import { read, write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { registerTestRssCategoryIdentity } from './rss-category-identities.mts'

export async function insertTestRssFeedCategory(
  rssFeedId: string,
  categoryText: string,
  topicId: string | null,
): Promise<string> {
  const categoryId = await registerTestRssCategoryIdentity(categoryText)
  await write(
    sql`/* insertTestRssFeedCategory */
    INSERT INTO rss_feed_categories (rss_feed_id, category_identity_id, topic_id)
    VALUES (${rssFeedId}, ${categoryId}, ${topicId})
    ON CONFLICT (rss_feed_id, category_identity_id) DO UPDATE SET topic_id = EXCLUDED.topic_id
  `,
  )
  return categoryId
}

export async function setTestRssFeedCategoryTopicId(
  rssFeedId: string,
  categoryIdentityId: string,
  topicId: string | null,
  query: QueryExecutor = write,
): Promise<void> {
  await query(
    `/* setTestRssFeedCategoryTopicId */
     UPDATE rss_feed_categories SET topic_id = $3::uuid
     WHERE rss_feed_id = $1::uuid AND category_identity_id = $2::uuid`,
    [rssFeedId, categoryIdentityId, topicId],
  )
}

export async function getTestRssFeedCategories(
  rssFeedId: string,
): Promise<Array<{ category_text: string; topic_id: string | null }>> {
  const { rows } = await read<{ category_text: string; topic_id: string | null }>(
    sql`/* getTestRssFeedCategories */
    SELECT identity.category_text, category.topic_id
    FROM rss_feed_categories category
    JOIN rss_category_identities identity ON identity.id = category.category_identity_id
    WHERE category.rss_feed_id = ${rssFeedId}
    ORDER BY identity.category_text
  `,
  )
  return rows
}

export async function clearTestRssFeedItemCategoryTopicAlias(
  rssFeedItemId: string,
  categoryText: string,
): Promise<void> {
  await write(
    sql`/* clearTestRssFeedItemCategoryTopicAlias */
    UPDATE rss_feed_item_categories category
    SET topic_alias_id = NULL
    WHERE category.rss_feed_item_id = ${rssFeedItemId}
      AND category.category_identity_id = (
        SELECT identity.id FROM rss_category_identities identity
        WHERE identity.category_text = LOWER(TRIM(${categoryText}))
      )
  `,
  )
}
