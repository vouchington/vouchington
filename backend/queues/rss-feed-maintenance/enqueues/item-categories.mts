import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { rssFeedMaintenance } from '../queues.mts'
import type { EnqueueReturnType } from '@voucha/types'
import {
  CATEGORY_SNAPSHOT_RECOVERY_DEDUPLICATION_ID,
  CATEGORY_SNAPSHOT_RECOVERY_DEDUPLICATION_TTL_MS,
  QUEUE_NAME,
  PRIORITY_DEFAULT,
  PRIORITY_RECOVERY,
  RSS_FEED_ITEM_CATEGORY_ORDERING,
} from '../config.mts'
import type {
  TopicTextCategoryCursor,
  RssFeedItemCategorySourcePage,
  RssFeedItemCategoryParentCursor,
  RssFeedMaintenanceJobPayloads,
} from '../types.mts'
import { createRssFeedMaintenanceEnqueue } from './create-enqueue.mts'

const enqueueBackfillCategoriesForTopicAliasesJob = createRssFeedMaintenanceEnqueue(
  'processBackfillCategoriesForTopicAliases',
)

const enqueueReconcileRssFeedItemCategorySnapshotsJob = createRssFeedMaintenanceEnqueue(
  'processReconcileRssFeedItemCategorySnapshots',
)

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
export const enqueueContinueRssFeedItemCategorySnapshotReconciliation = (
  rssFeedItemIds?: string[],
  after?: RssFeedItemCategoryParentCursor,
): EnqueueReturnType =>
  enqueueReconcileRssFeedItemCategorySnapshotsJob(
    { rssFeedItemIds, ...(after ? { after } : {}) },
    {
      priority: PRIORITY_RECOVERY,
      ordering: RSS_FEED_ITEM_CATEGORY_ORDERING.snapshot_reconciliation,
    },
  )

/** Admit one bounded parent page in one native bulk call. */
export const enqueueBulkRssFeedItemCategorySourcePages = createBulkEnqueueFunction({
  queue: rssFeedMaintenance,
  queueName: QUEUE_NAME,
  jobName: 'processReconcileRssFeedItemCategorySnapshots',
  buildJob: (sourcePage: RssFeedItemCategorySourcePage) => ({
    data: {
      sourcePage,
    } satisfies RssFeedMaintenanceJobPayloads['processReconcileRssFeedItemCategorySnapshots'],
  }),
  defaults: {
    priority: PRIORITY_RECOVERY,
    ordering: RSS_FEED_ITEM_CATEGORY_ORDERING.snapshot_reconciliation,
  },
})

export const enqueueBackfillCategoriesForTopicAliases = (
  topicId: string,
  cursor: TopicTextCategoryCursor | null = null,
  priority?: number,
): EnqueueReturnType => {
  return enqueueBackfillCategoriesForTopicAliasesJob(
    { topicId, cursor },
    { priority: priority ?? PRIORITY_DEFAULT },
  )
}

const enqueueBackfillRssFeedCategoriesForTopicAliasJob = createRssFeedMaintenanceEnqueue(
  'processBackfillRssFeedCategoriesForTopicAlias',
)

export const enqueueBackfillRssFeedCategoriesForTopicAlias = (
  topicId: string,
  cursor: TopicTextCategoryCursor | null = null,
  priority?: number,
): EnqueueReturnType => {
  return enqueueBackfillRssFeedCategoriesForTopicAliasJob(
    { topicId, cursor },
    { priority: priority ?? PRIORITY_DEFAULT },
  )
}
