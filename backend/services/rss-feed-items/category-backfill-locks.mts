import type { TransactionQuery } from '@data-stores/psql/types'
import { lockTopicRssFeedAttachmentLifecycles } from '@services/post-publication/lock'
import { lockRssFeedItemsForStoryPublicationChanges } from './story-publication-change.mts'

type CategoryKey = { rss_feed_item_id: string; category_identity_id: string }

/** Preserve the attachment → item → category lock order before the fresh owner check. */
export async function lockCategoryBackfillPage(
  query: TransactionQuery,
  topicId: string,
  oldTopicIds: string[],
  candidateItemIds: string[],
  categoryKeys: CategoryKey[],
): Promise<void> {
  await lockTopicRssFeedAttachmentLifecycles(query, [topicId, ...oldTopicIds])
  await lockCategoryItemsAndRows(query, candidateItemIds, categoryKeys)
}

export async function lockCategoryItemsAndRows(
  query: TransactionQuery,
  candidateItemIds: string[],
  categoryKeys: CategoryKey[],
  purpose: 'backfill' | 'clear' = 'backfill',
): Promise<void> {
  await lockRssFeedItemsForStoryPublicationChanges(query, candidateItemIds)
  const statement = `SELECT category.rss_feed_item_id
     FROM UNNEST($1::uuid[], $2::uuid[]) AS raw(rss_feed_item_id, category_identity_id)
     JOIN rss_feed_item_categories category
       ON category.rss_feed_item_id = raw.rss_feed_item_id
       AND category.category_identity_id = raw.category_identity_id
     ORDER BY category.rss_feed_item_id, category.category_identity_id
     FOR UPDATE OF category`
  const parameters = [
    categoryKeys.map(row => row.rss_feed_item_id),
    categoryKeys.map(row => row.category_identity_id),
  ]
  if (purpose === 'clear') {
    await query(
      `/* clearCategoriesForUnlinkedTopicAlias.lockRawCategories */ ${statement}`,
      parameters,
    )
    return
  }
  await query(`/* backfillCategoriesForTopicAliases lockRawCategories */ ${statement}`, parameters)
}
