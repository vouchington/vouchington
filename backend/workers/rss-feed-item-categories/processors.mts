import { backfillCategoriesForTopicAliases } from '@services/rss-feed-items/categories'
import { backfillCategoriesForTopicAlias } from '@services/rss-feeds/categories'
import {
  CATEGORY_SNAPSHOT_RECONCILIATION_BATCH_SIZE,
  reconcileRssFeedItemCategorySnapshots,
} from '@services/rss-feed-items/category-snapshot-reconciliations'
import { enqueueContinueRssFeedItemCategorySnapshotReconciliation } from '@queues/rss-feed-item-categories/enqueues'

type RssFeedItemCategoryDependencies = {
  backfillCategoriesForTopicAlias: typeof backfillCategoriesForTopicAlias
  backfillCategoriesForTopicAliases: typeof backfillCategoriesForTopicAliases
  reconcileRssFeedItemCategorySnapshots: typeof reconcileRssFeedItemCategorySnapshots
  enqueueContinueRssFeedItemCategorySnapshotReconciliation: typeof enqueueContinueRssFeedItemCategorySnapshotReconciliation
}

/** Applies and exact-generation acknowledges bounded durable category snapshots. */
export const processReconcileRssFeedItemCategorySnapshots = async (
  _data: Record<string, never>,
  dependencies?: Partial<RssFeedItemCategoryDependencies>,
) => {
  const reconcile =
    dependencies?.reconcileRssFeedItemCategorySnapshots ?? reconcileRssFeedItemCategorySnapshots
  const enqueueContinuation =
    dependencies?.enqueueContinueRssFeedItemCategorySnapshotReconciliation ??
    enqueueContinueRssFeedItemCategorySnapshotReconciliation
  const result = await reconcile()
  if (result.reconciled === CATEGORY_SNAPSHOT_RECONCILIATION_BATCH_SIZE) {
    await enqueueContinuation()
  }
  return result
}

/**
 * Backfill topic_id for categories when a topic's aliases are updated
 * This matches all categories with text matching the topic's aliases
 */
export const processBackfillCategoriesForTopicAliases = (
  { topicId }: { topicId: string },
  dependencies?: Partial<RssFeedItemCategoryDependencies>,
) => {
  const backfill =
    dependencies?.backfillCategoriesForTopicAliases ?? backfillCategoriesForTopicAliases
  return backfill(topicId)
}

/**
 * Backfill topic_id for feed-level categories when a topic's aliases/name/slug change.
 */
export const processBackfillRssFeedCategoriesForTopicAlias = (
  { topicId }: { topicId: string },
  dependencies?: Partial<RssFeedItemCategoryDependencies>,
) => {
  const backfill = dependencies?.backfillCategoriesForTopicAlias ?? backfillCategoriesForTopicAlias
  return backfill(topicId)
}
