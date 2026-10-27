import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { createHash } from 'node:crypto'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import type { EnqueueReturnType } from '@voucha/types'
import {
  PRIORITY_DEFAULT,
  PRIORITY_RECOVERY,
  QUEUE_NAME,
  CATEGORY_MAPPING_RECOVERY_DEDUPLICATION_ID,
  CATEGORY_MAPPING_RECOVERY_DEDUPLICATION_TTL_MS,
  TOPIC_ALIAS_ORDERING,
} from '../config.mts'
import { rssFeedMaintenance } from '../queues.mts'
import type { TopicAliasJobs, TopicAliasPostInvalidationData } from '../types.mts'

const JOB_NAME: TopicAliasJobs = 'processTopicAliasesUpdate'

const enqueueTopicAliasesUpdateJob = createEnqueueFunction<{ topicId: string }, TopicAliasJobs>({
  queue: rssFeedMaintenance,
  queueName: QUEUE_NAME,
  jobName: JOB_NAME,
})

const enqueueReconcileTopicAliasCategoryMappingsJob = createEnqueueFunction<
  { topicAliasIds?: string[] },
  TopicAliasJobs
>({
  queue: rssFeedMaintenance,
  queueName: QUEUE_NAME,
  jobName: 'processReconcileTopicAliasCategoryMappings',
})

const enqueueInvalidatePostsForTopicAliasesJobs = createBulkEnqueueFunction({
  queue: rssFeedMaintenance,
  queueName: QUEUE_NAME,
  jobName: 'processInvalidatePostsForTopicAliases',
  buildJob: (data: TopicAliasPostInvalidationData) => ({
    data,
    opts: {
      priority: PRIORITY_DEFAULT,
      ordering: TOPIC_ALIAS_ORDERING.post_invalidation,
      jobId: postInvalidationJobId(data),
    },
  }),
})

function postInvalidationJobId(data: TopicAliasPostInvalidationData): string {
  const aliasHash = createHash('sha256')
    .update(JSON.stringify([...new Set(data.topicAliasIds)].toSorted()))
    .digest('hex')
  return `topic_alias_post_invalidation__${data.changeId}__${data.afterPostId}__${aliasHash}`
}

const enqueueBulkTopicAliasesUpdateJobs = createBulkEnqueueFunction({
  queue: rssFeedMaintenance,
  queueName: QUEUE_NAME,
  jobName: JOB_NAME,
  buildJob: (topicId: string) => ({
    data: { topicId },
  }),
})

export const enqueueTopicAliasesUpdate = (
  topicId: string,
  priority?: number,
): EnqueueReturnType => {
  return enqueueTopicAliasesUpdateJob({ topicId }, { priority: priority ?? PRIORITY_DEFAULT })
}

export const enqueueReconcileTopicAliasCategoryMappings = (
  options: { deduplicationId?: string } = {},
): EnqueueReturnType => {
  return enqueueReconcileTopicAliasCategoryMappingsJob(
    {},
    {
      priority: PRIORITY_RECOVERY,
      ordering: TOPIC_ALIAS_ORDERING.category_mapping_reconciliation,
      deduplication: {
        id: options.deduplicationId ?? CATEGORY_MAPPING_RECOVERY_DEDUPLICATION_ID,
        mode: 'throttle',
        ttl: CATEGORY_MAPPING_RECOVERY_DEDUPLICATION_TTL_MS,
      },
    },
  )
}

/** Chains another bounded reconciliation page without throttle deduplication. */
export const enqueueContinueTopicAliasCategoryMappingReconciliation = (
  topicAliasIds?: string[],
): EnqueueReturnType =>
  enqueueReconcileTopicAliasCategoryMappingsJob(
    { topicAliasIds },
    {
      priority: PRIORITY_RECOVERY,
      ordering: TOPIC_ALIAS_ORDERING.category_mapping_reconciliation,
    },
  )

/** A retried parent page re-activates a terminally failed continuation instead of stalling. */
export const enqueueContinueInvalidatingPostsForTopicAliases = (
  topicAliasIds: string[],
  changeId: string,
  afterPostId: string,
): EnqueueReturnType =>
  enqueueBulkReactivatingFinished({
    queue: rssFeedMaintenance,
    inputs: [{ afterPostId, topicAliasIds, changeId }],
    jobIdOf: postInvalidationJobId,
    enqueueBulk: enqueueInvalidatePostsForTopicAliasesJobs,
  })

export const enqueueBulkTopicAliasesUpdate = (
  topicIds: string[],
  priority?: number,
): EnqueueReturnType => {
  return enqueueBulkTopicAliasesUpdateJobs(topicIds, { priority: priority ?? PRIORITY_DEFAULT })
}
