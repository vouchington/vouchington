import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import {
  CATEGORY_SNAPSHOT_RECOVERY_DEDUPLICATION_ID,
  CATEGORY_SNAPSHOT_RECOVERY_DEDUPLICATION_TTL_MS,
  PRIORITY_DEFAULT,
  PRIORITY_RECOVERY,
  QUEUE_NAME,
  RSS_FEED_ITEM_CATEGORY_ORDERING,
} from './config.mts'
import { rssFeedItemCategories } from './queues.mts'

const enqueueBackfillCategoriesForTopicAliasesJob = createEnqueueFunction<
  { topicId: string },
  'processBackfillCategoriesForTopicAliases'
>({
  queue: rssFeedItemCategories,
  queueName: QUEUE_NAME,
  jobName: 'processBackfillCategoriesForTopicAliases',
})

const enqueueReconcileRssFeedItemCategorySnapshotsJob = createEnqueueFunction<
  Record<string, never>,
  'processReconcileRssFeedItemCategorySnapshots'
>({
  queue: rssFeedItemCategories,
  queueName: QUEUE_NAME,
  jobName: 'processReconcileRssFeedItemCategorySnapshots',
})

export const enqueueReconcileRssFeedItemCategorySnapshots = (
  options: { deduplicationId?: string } = {},
): EnqueueReturnType =>
  enqueueReconcileRssFeedItemCategorySnapshotsJob(
    {},
    {
      priority: PRIORITY_RECOVERY,
      ordering: RSS_FEED_ITEM_CATEGORY_ORDERING.snapshot_reconciliation,
      deduplication: {
        id: options.deduplicationId ?? CATEGORY_SNAPSHOT_RECOVERY_DEDUPLICATION_ID,
        mode: 'throttle',
        ttl: CATEGORY_SNAPSHOT_RECOVERY_DEDUPLICATION_TTL_MS,
      },
    },
  )

/** Chains another bounded page without throttle deduplication; queue ordering keeps one active. */
export const enqueueContinueRssFeedItemCategorySnapshotReconciliation = (): EnqueueReturnType =>
  enqueueReconcileRssFeedItemCategorySnapshotsJob(
    {},
    {
      priority: PRIORITY_RECOVERY,
      ordering: RSS_FEED_ITEM_CATEGORY_ORDERING.snapshot_reconciliation,
    },
  )

export const enqueueBackfillCategoriesForTopicAliases = (
  topicId: string,
  priority?: number,
): EnqueueReturnType => {
  return enqueueBackfillCategoriesForTopicAliasesJob(
    { topicId },
    { priority: priority ?? PRIORITY_DEFAULT },
  )
}

const enqueueBackfillRssFeedCategoriesForTopicAliasJob = createEnqueueFunction<
  { topicId: string },
  'processBackfillRssFeedCategoriesForTopicAlias'
>({
  queue: rssFeedItemCategories,
  queueName: QUEUE_NAME,
  jobName: 'processBackfillRssFeedCategoriesForTopicAlias',
})

export const enqueueBackfillRssFeedCategoriesForTopicAlias = (
  topicId: string,
  priority?: number,
): EnqueueReturnType => {
  return enqueueBackfillRssFeedCategoriesForTopicAliasJob(
    { topicId },
    { priority: priority ?? PRIORITY_DEFAULT },
  )
}
