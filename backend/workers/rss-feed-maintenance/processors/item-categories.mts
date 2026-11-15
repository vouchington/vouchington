import { getRssFeedItemsWorkLimit } from '@services/rss-feed-items/work-limits'
import {
  backfillTopicTextItemPage,
  backfillTopicTextFeedPage,
} from '@services/rss-feeds/topic-text-category-backfill'
import {
  reconcileRssFeedItemCategorySnapshots,
  reconcileRssFeedItemCategorySourcePage,
} from '@services/rss-feed-items/category-snapshot-reconciliations'
import {
  enqueueContinueRssFeedItemCategorySnapshotReconciliation,
  enqueueBulkRssFeedItemCategorySourcePages,
  enqueueBackfillCategoriesForTopicAliases,
  enqueueBackfillRssFeedCategoriesForTopicAlias,
} from '@queues/rss-feed-maintenance/enqueues/item-categories'
import type {
  TopicTextCategoryJob,
  RssFeedMaintenanceJobPayloads,
} from '@queues/rss-feed-maintenance/types'

/** Applies and exact-generation acknowledges bounded durable category snapshots. */
export const processReconcileRssFeedItemCategorySnapshots = async (
  data: RssFeedMaintenanceJobPayloads['processReconcileRssFeedItemCategorySnapshots'],
) => {
  const CATEGORY_SNAPSHOT_RECONCILIATION_BATCH_SIZE = getRssFeedItemsWorkLimit(
    'category_snapshot_reconciliation_batch_size',
  )
  const result = data.sourcePage
    ? await reconcileRssFeedItemCategorySourcePage(data.sourcePage)
    : await reconcileRssFeedItemCategorySnapshots(
        CATEGORY_SNAPSHOT_RECONCILIATION_BATCH_SIZE,
        data.rssFeedItemIds,
        data.after,
      )
  if (result.sourcePages?.length)
    await enqueueBulkRssFeedItemCategorySourcePages(result.sourcePages)
  if (!data.sourcePage && result.after) {
    await enqueueContinueRssFeedItemCategorySnapshotReconciliation(
      data.rssFeedItemIds,
      result.after,
    )
  }
  const { after: _after, ...response } = result
  return response
}

/**
 * Backfill topic_id for categories when a topic's aliases are updated
 * This matches all categories with text matching the topic's aliases
 */
export const processBackfillCategoriesForTopicAliases = async ({
  topicId,
  cursor,
}: TopicTextCategoryJob) => {
  const result = await backfillTopicTextItemPage(topicId, cursor)
  if (result.hasMore) await enqueueBackfillCategoriesForTopicAliases(topicId, result.cursor)
  return result
}

/**
 * Backfill topic_id for feed-level categories when a topic's aliases/name/slug change.
 */
export const processBackfillRssFeedCategoriesForTopicAlias = async ({
  topicId,
  cursor,
}: TopicTextCategoryJob) => {
  const result = await backfillTopicTextFeedPage(topicId, cursor)
  if (result.hasMore) await enqueueBackfillRssFeedCategoriesForTopicAlias(topicId, result.cursor)
  return result
}
