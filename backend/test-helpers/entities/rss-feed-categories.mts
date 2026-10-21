import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { registerTestRssCategoryIdentity } from './rss-category-identities.mts'

export async function insertTestRssFeedCategory(
  rssFeedId: string,
  categoryText: string,
  topicId: string | null,
): Promise<void> {
  const categoryId = await registerTestRssCategoryIdentity(categoryText)
  await write(
    allowUnannotatedQuery(sql`
    INSERT INTO rss_feed_categories (rss_feed_id, category_identity_id, topic_id)
    VALUES (${rssFeedId}, ${categoryId}, ${topicId})
    ON CONFLICT (rss_feed_id, category_identity_id) DO UPDATE SET topic_id = EXCLUDED.topic_id
  `),
  )
}

export async function getTestRssFeedCategories(
  rssFeedId: string,
): Promise<Array<{ category_text: string; topic_id: string | null }>> {
  const { rows } = await read<{ category_text: string; topic_id: string | null }>(
    allowUnannotatedQuery(sql`
    SELECT identity.category_text, category.topic_id
    FROM rss_feed_categories category
    JOIN rss_category_identities identity ON identity.id = category.category_identity_id
    WHERE category.rss_feed_id = ${rssFeedId}
    ORDER BY identity.category_text
  `),
  )
  return rows
}

export async function clearTestRssFeedItemCategoryTopicAlias(
  rssFeedItemId: string,
  categoryText: string,
): Promise<void> {
  await write(
    allowUnannotatedQuery(sql`
    UPDATE rss_feed_item_categories category
    SET topic_alias_id = NULL
    WHERE category.rss_feed_item_id = ${rssFeedItemId}
      AND category.category_identity_id = (
        SELECT identity.id FROM rss_category_identities identity
        WHERE identity.category_text = LOWER(TRIM(${categoryText}))
      )
  `),
  )
}
