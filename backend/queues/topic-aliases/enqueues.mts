import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import {
  PRIORITY_DEFAULT,
  PRIORITY_RECOVERY,
  QUEUE_NAME,
  CATEGORY_MAPPING_RECOVERY_DEDUPLICATION_ID,
  CATEGORY_MAPPING_RECOVERY_DEDUPLICATION_TTL_MS,
  TOPIC_ALIAS_ORDERING,
} from './config.mts'
import { topicAliases } from './queues.mts'
import type { TopicAliasJobs } from './types.mts'

const JOB_NAME: TopicAliasJobs = 'processTopicAliasesUpdate'

const enqueueTopicAliasesUpdateJob = createEnqueueFunction<{ topicId: string }, TopicAliasJobs>({
  queue: topicAliases,
  queueName: QUEUE_NAME,
  jobName: JOB_NAME,
})

const enqueueTopicAliasRemovalUpdateJob = createEnqueueFunction<
  { topicId: string; removedTopicAliasId: string },
  TopicAliasJobs
>({
  queue: topicAliases,
  queueName: QUEUE_NAME,
  jobName: JOB_NAME,
})

const enqueueReconcileTopicAliasCategoryMappingsJob = createEnqueueFunction<
  Record<string, never>,
  TopicAliasJobs
>({
  queue: topicAliases,
  queueName: QUEUE_NAME,
  jobName: 'processReconcileTopicAliasCategoryMappings',
})

const enqueueInvalidatePostsForTopicAliasesJob = createEnqueueFunction<
  { afterPostId?: string; topicAliasIds: string[] },
  TopicAliasJobs
>({
  queue: topicAliases,
  queueName: QUEUE_NAME,
  jobName: 'processInvalidatePostsForTopicAliases',
})

const enqueueBulkTopicAliasesUpdateJobs = createBulkEnqueueFunction<
  string,
  { topicId: string },
  TopicAliasJobs
>({
  queue: topicAliases,
  queueName: QUEUE_NAME,
  jobName: JOB_NAME,
  buildJob: topicId => ({
    data: { topicId },
  }),
})

export const enqueueTopicAliasesUpdate = (
  topicId: string,
  priority?: number,
): EnqueueReturnType => {
  return enqueueTopicAliasesUpdateJob({ topicId }, { priority: priority ?? PRIORITY_DEFAULT })
}

export const enqueueTopicAliasRemovalUpdate = (
  topicId: string,
  removedTopicAliasId: string,
  priority?: number,
): EnqueueReturnType => {
  return enqueueTopicAliasRemovalUpdateJob(
    { topicId, removedTopicAliasId },
    { priority: priority ?? PRIORITY_DEFAULT },
  )
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
export const enqueueContinueTopicAliasCategoryMappingReconciliation = (): EnqueueReturnType =>
  enqueueReconcileTopicAliasCategoryMappingsJob(
    {},
    {
      priority: PRIORITY_RECOVERY,
      ordering: TOPIC_ALIAS_ORDERING.category_mapping_reconciliation,
    },
  )

export const enqueueContinueInvalidatingPostsForTopicAliases = (
  topicAliasIds: string[],
  afterPostId: string,
): EnqueueReturnType =>
  enqueueInvalidatePostsForTopicAliasesJob(
    { afterPostId, topicAliasIds },
    { priority: PRIORITY_DEFAULT, ordering: TOPIC_ALIAS_ORDERING.post_invalidation },
  )

export const enqueueBulkTopicAliasesUpdate = (
  topicIds: string[],
  priority?: number,
): EnqueueReturnType => {
  return enqueueBulkTopicAliasesUpdateJobs(topicIds, { priority: priority ?? PRIORITY_DEFAULT })
}
