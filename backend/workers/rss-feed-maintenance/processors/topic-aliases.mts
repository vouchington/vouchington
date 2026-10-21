import { getRssFeedsWorkLimit } from '@services/rss-feeds/work-limits'
import { invalidate } from '@services/entity-cache/invalidate'
import { updateTopicEmbeddingContentHash } from '@services/topics/content'
import {
  enqueueBackfillCategoriesForTopicAliases,
  enqueueBackfillRssFeedCategoriesForTopicAlias,
} from '@queues/rss-feed-maintenance/enqueues/item-categories'
import {
  enqueueContinueInvalidatingPostsForTopicAliases,
  enqueueContinueTopicAliasCategoryMappingReconciliation,
} from '@queues/rss-feed-maintenance/enqueues/topic-aliases'
import { invalidatePostsForTopicAliasesPage } from '@services/topics/invalidate-posts-for-topic-aliases'
import { backfillCategoriesForTopicAlias } from '@services/rss-feeds/categories'
import { clearCategoriesForUnlinkedTopicAlias } from '@services/rss-feed-items/clear-topic-alias-categories'
import { processReconcileTopicAliasCategoryMappings as reconcileTopicAliasCategoryMappings } from '@services/rss-feeds/reconcile-topic-alias-category-mappings'

type TopicAliasCategoryMappingReconciliationDependencies = {
  enqueueContinueTopicAliasCategoryMappingReconciliation: typeof enqueueContinueTopicAliasCategoryMappingReconciliation
  processReconcileTopicAliasCategoryMappings: typeof reconcileTopicAliasCategoryMappings
}

type TopicAliasPostInvalidationDependencies = {
  enqueueContinueInvalidatingPostsForTopicAliases: typeof enqueueContinueInvalidatingPostsForTopicAliases
  invalidatePostsForTopicAliasesPage: typeof invalidatePostsForTopicAliasesPage
}

export async function processInvalidatePostsForTopicAliases(
  data: { afterPostId?: string; topicAliasIds: string[] },
  dependencies?: Partial<TopicAliasPostInvalidationDependencies>,
) {
  const invalidate =
    dependencies?.invalidatePostsForTopicAliasesPage ?? invalidatePostsForTopicAliasesPage
  const enqueueContinuation =
    dependencies?.enqueueContinueInvalidatingPostsForTopicAliases ??
    enqueueContinueInvalidatingPostsForTopicAliases
  const result = await invalidate(data.topicAliasIds, data.afterPostId)
  if (result.hasMore && result.lastPostId)
    await enqueueContinuation(data.topicAliasIds, result.lastPostId)
  return result
}

export const processReconcileTopicAliasCategoryMappings = async (
  data: { topicAliasIds?: string[] },
  dependencies?: Partial<TopicAliasCategoryMappingReconciliationDependencies>,
) => {
  const reconcile =
    dependencies?.processReconcileTopicAliasCategoryMappings ?? reconcileTopicAliasCategoryMappings
  const enqueueContinuation =
    dependencies?.enqueueContinueTopicAliasCategoryMappingReconciliation ??
    enqueueContinueTopicAliasCategoryMappingReconciliation
  const TOPIC_ALIAS_CATEGORY_MAPPING_RECONCILIATION_BATCH_SIZE = getRssFeedsWorkLimit(
    'topic_alias_category_mapping_reconciliation_batch_size',
  )
  const result = await reconcile(
    TOPIC_ALIAS_CATEGORY_MAPPING_RECONCILIATION_BATCH_SIZE,
    data.topicAliasIds,
  )
  if (result.hasMore) {
    await enqueueContinuation(data.topicAliasIds)
  }
  return result
}

export const processTopicAliasesUpdate = async ({
  topicId,
  removedTopicAliasId,
}: {
  topicId: string
  removedTopicAliasId?: string
}) => {
  if (removedTopicAliasId) {
    const cleared = await clearCategoriesForUnlinkedTopicAlias(removedTopicAliasId, topicId)
    if (cleared.hasMore)
      await enqueueContinueTopicAliasCategoryMappingReconciliation([removedTopicAliasId])
  }

  // The database projects the alias cache; refresh readers after the committed write.
  await invalidate.topics(topicId)

  // Update the content hash to mark embeddings as stale
  // This lets the batch embedding process handle updates
  await updateTopicEmbeddingContentHash(topicId)

  // Backfill RSS feed item categories that match the new aliases
  // This updates category records to link them to this topic
  await enqueueBackfillCategoriesForTopicAliases(topicId)

  // Backfill feed-level podcast categories for the same alias change
  const feedBackfill = await backfillCategoriesForTopicAlias(topicId)
  if (feedBackfill.hasMore) await enqueueBackfillRssFeedCategoriesForTopicAlias(topicId)
}
