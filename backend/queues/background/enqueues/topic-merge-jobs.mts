import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'
import { pagedDispatchJobOptions } from '@data-stores/valkey-glide-mq/paged-dispatcher'

export const TOPIC_MERGE_DOMAIN = defineBackgroundDomain({
  domain: 'topic-merge',
  workerConcurrency: 2,
})

export type TopicMergePageData = { operationId: string; generation: number }
export type TopicMergeRecoveryData = {
  highWaterId?: string | null
  staleBefore?: string
  cursorOperationId?: string | null
}

export const TOPIC_MERGE_PAGE_JOB = defineBackgroundJob<TopicMergePageData>(TOPIC_MERGE_DOMAIN, {
  name: 'processPage',
  priority: PRIORITY_TASK,
  ordering: { key: 'topic-merge:tasks' },
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000, jitter: 0.5 },
  removeOnComplete: true,
  removeOnFail: true,
})

export const TOPIC_MERGE_RECOVER_JOB = defineBackgroundJob<TopicMergeRecoveryData>(
  TOPIC_MERGE_DOMAIN,
  {
    name: 'recoverStalled',
    priority: PRIORITY_DISPATCH,
    ordering: { key: 'topic-merge:dispatcher' },
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000, jitter: 0.5 },
    ...pagedDispatchJobOptions('topicMerges'),
    removeOnComplete: true,
    removeOnFail: true,
  },
)

export const TOPIC_MERGE_JOBS = [TOPIC_MERGE_PAGE_JOB, TOPIC_MERGE_RECOVER_JOB] as const
