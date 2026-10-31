import { getRssFeedItemsWorkLimit } from '@services/rss-feed-items/work-limits'
import {
  backfillTopicTextItemPage,
  backfillTopicTextFeedPage,
} from '@services/rss-feeds/topic-text-category-backfill'
import { reconcileRssFeedItemCategorySnapshots } from '@services/rss-feed-items/category-snapshot-reconciliations'
import {
  enqueueContinueRssFeedItemCategorySnapshotReconciliation,
  enqueueBackfillCategoriesForTopicAliases,
  enqueueBackfillRssFeedCategoriesForTopicAlias,
} from '@queues/rss-feed-maintenance/enqueues/item-categories'
import type { TopicTextCategoryJob } from '@queues/rss-feed-maintenance/types'

type RssFeedItemCategoryDependencies = {
  backfillTopicTextItemPage: typeof backfillTopicTextItemPage
  backfillTopicTextFeedPage: typeof backfillTopicTextFeedPage
  reconcileRssFeedItemCategorySnapshots: typeof reconcileRssFeedItemCategorySnapshots
  enqueueContinueRssFeedItemCategorySnapshotReconciliation: typeof enqueueContinueRssFeedItemCategorySnapshotReconciliation
}

/** Applies and exact-generation acknowledges bounded durable category snapshots. */
export const processReconcileRssFeedItemCategorySnapshots = async (
  data: { rssFeedItemIds?: string[] },
  dependencies?: Partial<RssFeedItemCategoryDependencies>,
) => {
  const reconcile =
    dependencies?.reconcileRssFeedItemCategorySnapshots ?? reconcileRssFeedItemCategorySnapshots
  const enqueueContinuation =
    dependencies?.enqueueContinueRssFeedItemCategorySnapshotReconciliation ??
    enqueueContinueRssFeedItemCategorySnapshotReconciliation
  const CATEGORY_SNAPSHOT_RECONCILIATION_BATCH_SIZE = getRssFeedItemsWorkLimit(
    'category_snapshot_reconciliation_batch_size',
  )
  const result = await reconcile(CATEGORY_SNAPSHOT_RECONCILIATION_BATCH_SIZE, data.rssFeedItemIds)
  if (result.reconciled === CATEGORY_SNAPSHOT_RECONCILIATION_BATCH_SIZE) {
    await enqueueContinuation(data.rssFeedItemIds)
  }
  return result
}

/**
 * Backfill topic_id for categories when a topic's aliases are updated
 * This matches all categories with text matching the topic's aliases
 */
export const processBackfillCategoriesForTopicAliases = async (
  { topicId, cursor }: TopicTextCategoryJob,
  dependencies?: Partial<RssFeedItemCategoryDependencies>,
) => {
  const backfill = dependencies?.backfillTopicTextItemPage ?? backfillTopicTextItemPage
  const result = await backfill(topicId, cursor)
  if (result.hasMore) await enqueueBackfillCategoriesForTopicAliases(topicId, result.cursor)
  return result
}

/**
 * Backfill topic_id for feed-level categories when a topic's aliases/name/slug change.
 */
export const processBackfillRssFeedCategoriesForTopicAlias = async (
  { topicId, cursor }: TopicTextCategoryJob,
  dependencies?: Partial<RssFeedItemCategoryDependencies>,
) => {
  const backfill = dependencies?.backfillTopicTextFeedPage ?? backfillTopicTextFeedPage
  const result = await backfill(topicId, cursor)
  if (result.hasMore) await enqueueBackfillRssFeedCategoriesForTopicAlias(topicId, result.cursor)
  return result
}
