import { getOrCreateQueue } from '../../test-helpers/glide-mq-vitest-internals.mts'
import { AI_AGENTS_QUEUE_NAME } from '../queues/ai-agents/config.mts'
import { postClassifierJobId } from '../queues/ai-agents/enqueues/post-classifier.mts'
import { ai_agents } from '../queues/ai-agents/queues.mts'
import type { PostClassifierJobData } from '../queues/ai-agents/types.mts'
import { readAllQueueJobs } from './queue-jobs.mts'

/**
 * Deletes one receipt's stable-id job from the in-memory queue, as `removeOnFail` and
 * `removeOnComplete` do in production, so the recovery sweep may enqueue it again.
 */
export function removePostClassifierJobForTest(applicationId: string): void {
  const queue = getOrCreateQueue(AI_AGENTS_QUEUE_NAME)
  const jobId = postClassifierJobId(applicationId)
  queue.jobs.delete(jobId)
  const waitingIndex = queue.waitingQueue.findIndex(record => record.id === jobId)
  if (waitingIndex >= 0) queue.waitingQueue.splice(waitingIndex, 1)
}

/** The queue jobs (in any state) that carry one receipt, scoped so shared queue history is ignored. */
export async function readPostClassifierJobsForTest(applicationId: string) {
  return (await readAllQueueJobs(ai_agents)).filter(
    job =>
      job.name === 'post-classifier' &&
      (job.data as Partial<PostClassifierJobData>).applicationId === applicationId,
  )
}
