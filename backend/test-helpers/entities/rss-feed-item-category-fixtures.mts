import { write } from '@data-stores/psql'
import { registerTestRssCategoryIdentity } from './rss-category-identities.mts'

async function insertTestCategory(
  rssFeedItemId: string,
  categoryText: string,
  topicId: string | null,
  topicAliasId: string | null,
): Promise<void> {
  const categoryId = await registerTestRssCategoryIdentity(categoryText)
  await write(
    `/* insertTestCategory */
    INSERT INTO rss_feed_item_categories
      (rss_feed_item_id, category_identity_id, category_text, topic_id, topic_alias_id)
    VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5::uuid)
    ON CONFLICT DO NOTHING`,
    [rssFeedItemId, categoryId, categoryText, topicId, topicAliasId],
  )
}

export async function addCategoryToRssFeedItem(
  rssFeedItemId: string,
  topicId: string,
  categoryText = 'test-category',
): Promise<void> {
  await insertTestCategory(rssFeedItemId, categoryText, topicId, null)
}

export async function addTopicAliasCategoryToRssFeedItem(
  rssFeedItemId: string,
  topicAliasId: string,
  categoryText = 'test-alias-category',
): Promise<void> {
  await insertTestCategory(rssFeedItemId, categoryText, null, topicAliasId)
}

export async function insertUnmappedRssFeedItemCategory(
  rssFeedItemId: string,
  categoryText: string,
): Promise<void> {
  await insertTestCategory(rssFeedItemId, categoryText, null, null)
}
