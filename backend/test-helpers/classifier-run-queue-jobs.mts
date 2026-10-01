import { getOrCreateQueue } from '../../test-helpers/glide-mq-vitest-internals.mts'
import { AI_AGENTS_QUEUE_NAME } from '../queues/ai-agents/config.mts'
import { classifierRunJobId } from '../queues/ai-agents/enqueues/classifier-run.mts'
import { ai_agents } from '../queues/ai-agents/queues.mts'
import type {
  ClassifierRunDispatcherJobData,
  ClassifierRunJobData,
} from '../queues/ai-agents/types.mts'
import { readAllQueueJobs } from './queue-jobs.mts'

/**
 * Deletes one run's stable-id job from the in-memory queue, as `removeOnFail` and
 * `removeOnComplete` do in production, so the recovery sweep may enqueue it again.
 */
export function removeClassifierRunJobForTest(runId: string): void {
  const queue = getOrCreateQueue(AI_AGENTS_QUEUE_NAME)
  const jobId = classifierRunJobId(runId)
  queue.jobs.delete(jobId)
  const waitingIndex = queue.waitingQueue.findIndex(record => record.id === jobId)
  if (waitingIndex >= 0) queue.waitingQueue.splice(waitingIndex, 1)
}

/** The queue jobs (in any state) that carry one run, scoped so shared queue history is ignored. */
export async function readClassifierRunJobsForTest(runId: string) {
  return (await readAllQueueJobs(ai_agents)).filter(
    job =>
      job.name === 'classifier-run' && (job.data as Partial<ClassifierRunJobData>).runId === runId,
  )
}

/** The dispatcher jobs (in any state) that carry one post or feed item, ignoring shared queue history. */
export async function readClassifierRunDispatcherJobsForTest(subjectId: string) {
  return (await readAllQueueJobs(ai_agents)).filter(job => {
    const data = job.data as Partial<ClassifierRunDispatcherJobData>
    return (
      job.name === 'classifier-run-dispatcher' &&
      (data.postId === subjectId || data.rssFeedItemId === subjectId)
    )
  })
}
