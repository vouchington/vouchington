import { background } from '../queues.mts'
import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '../enqueues.mts'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import {
  TOPIC_MERGE_PAGE_JOB,
  TOPIC_MERGE_RECOVER_JOB,
  type TopicMergePageData,
} from './topic-merge-jobs.mts'
import type { JobOptions } from 'glide-mq'

const enqueuePage = createBackgroundEnqueue(TOPIC_MERGE_PAGE_JOB)
export const enqueueTopicMergeRecoveryContinuation =
  createBackgroundEnqueue(TOPIC_MERGE_RECOVER_JOB)
const enqueueBulkPages = createBackgroundBulkEnqueue(
  TOPIC_MERGE_PAGE_JOB,
  (data: TopicMergePageData) => ({ data, opts: { jobId: topicMergePageJobId(data) } }),
)

export function topicMergePageJobId(data: TopicMergePageData): string {
  return `topic_merge_page_${data.operationId}_${data.generation}`
}

export function enqueueTopicMergePage(operationId: string, generation: number) {
  const data = { operationId, generation }
  return enqueuePage(data, { jobId: topicMergePageJobId(data) } satisfies Partial<JobOptions>)
}

export function enqueueRecoveredTopicMergePages(inputs: TopicMergePageData[]) {
  return enqueueBulkReactivatingFinished({
    queue: background,
    inputs,
    jobIdOf: topicMergePageJobId,
    enqueueBulk: enqueueBulkPages,
  })
}

export function enqueueTopicMergeRecovery() {
  return enqueueTopicMergeRecoveryContinuation({})
}
