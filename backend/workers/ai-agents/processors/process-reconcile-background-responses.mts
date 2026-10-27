import type { Job, Queue } from 'glide-mq'
import { removeTerminalJobsWhen } from '@data-stores/valkey-glide-mq/terminal-job-removal'
import { getBackgroundResponseReconcilePageSize } from '@queues/ai-agents/config'
import { enqueueReconcileBackgroundResponsesPage } from '@queues/ai-agents/enqueues/reconcile-background-responses'
import { failedAiJobHasNoPendingResponses } from '@queues/ai-agents/enqueues/failed-job-recovery'
import { ai_agents } from '@queues/ai-agents/queues'
import type { AIAgentJobData, ReconcileBackgroundResponsesJobData } from '@queues/ai-agents/types'
import pMap from 'p-map'
import { reportReconcileFailure, settleFailedJobResponses } from './settle-failed-job-responses.mts'

const FAILED_JOB_VISIBILITY_COUNT = 100

type ReconcileJob = Job<ReconcileBackgroundResponsesJobData>
type ReconcileDeps = {
  queue: Queue<AIAgentJobData>
  enqueuePage: typeof enqueueReconcileBackgroundResponsesPage
  failedJobVisibilityCount: number
}
const defaultDeps: ReconcileDeps = {
  queue: ai_agents,
  enqueuePage: enqueueReconcileBackgroundResponsesPage,
  failedJobVisibilityCount: FAILED_JOB_VISIBILITY_COUNT,
}

/** One bounded page of retained failed jobs per job. */
export async function processReconcileBackgroundResponses(
  job: ReconcileJob,
  overrides: Partial<ReconcileDeps> = {},
): Promise<void> {
  const deps = { ...defaultDeps, ...overrides }
  const sweepId = job.data.sweepId ?? job.id
  if (job.data.phase === 'cleanup') {
    await cleanSettledFailedJobs(job, sweepId, deps)
    return
  }
  const offset = job.data.failedOffset ?? 0
  const pageSize = getBackgroundResponseReconcilePageSize()
  const failed = await deps.queue.getJobs('failed', offset, offset + pageSize - 1)
  // The job may be retried while this sweep runs. Settling rewrites a payload only while the job
  // is still failed, and the active worker clears its own pending IDs. Sequential jobs keep the
  // OpenAI retrieve/cancel limit at five.
  await pMap(
    failed,
    failedJob => settleFailedJobResponses(deps.queue, failedJob).catch(reportReconcileFailure),
    { concurrency: 1 },
  )
  const removedStableJobs = await pMap(
    failed,
    async failedJob => {
      if (!hasReactivatableStableId(failedJob)) return 0
      // Release a stable id only after its retained responses settle. The native WATCH guard
      // rejects an operator retry race; the domain's durable request decides if another run starts.
      return removeTerminalJobsWhen<AIAgentJobData>(
        deps.queue,
        [failedJob.id],
        failedAiJobHasNoPendingResponses,
      ).catch(reportReconcileFailure)
    },
    { concurrency: 1 },
  )
  const removed = removedStableJobs.reduce((sum, value) => sum + value, 0)
  const page = (job.data.page ?? 0) + 1
  if (failed.length === pageSize) {
    await deps.enqueuePage({
      phase: 'failed',
      failedOffset: offset + failed.length - removed,
      sweepId,
      page,
    })
  } else {
    await deps.enqueuePage({ phase: 'cleanup', failedOffset: 0, sweepId, page })
  }
}

async function cleanSettledFailedJobs(
  job: ReconcileJob,
  sweepId: string,
  deps: ReconcileDeps,
): Promise<void> {
  const offset = job.data.failedOffset ?? 0
  const count = (await deps.queue.getJobCounts()).failed
  const excess = Math.max(0, count - deps.failedJobVisibilityCount)
  if (offset >= excess) return
  const pageSize = Math.min(getBackgroundResponseReconcilePageSize(), excess - offset)
  const failed = await deps.queue.getJobs('failed', offset, offset + pageSize - 1)
  if (failed.length === 0) return
  await pMap(
    failed,
    entry => settleFailedJobResponses(deps.queue, entry).catch(reportReconcileFailure),
    { concurrency: 1 },
  )
  const removed = await removeTerminalJobsWhen<AIAgentJobData>(
    deps.queue,
    failed.map(entry => entry.id),
    failedAiJobHasNoPendingResponses,
  )
  const nextOffset = offset + failed.length - removed
  const remainingExcess = Math.max(
    0,
    (await deps.queue.getJobCounts()).failed - deps.failedJobVisibilityCount,
  )
  if (nextOffset < remainingExcess && failed.length === pageSize) {
    await deps.enqueuePage({
      phase: 'cleanup',
      failedOffset: nextOffset,
      sweepId,
      page: (job.data.page ?? 0) + 1,
    })
  }
}

function hasReactivatableStableId(job: Job<AIAgentJobData>): boolean {
  if (job.name === 'report-judgement') {
    return 'run_id' in job.data && job.data.run_id != null
  }
  return (
    job.name === 'classifier-run' ||
    job.name === 'dispute-resolution' ||
    job.name === 'appeal-resolution' ||
    job.name === 'recover-background-response'
  )
}
