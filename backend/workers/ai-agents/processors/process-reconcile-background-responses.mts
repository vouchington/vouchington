import type { Job, Queue } from 'glide-mq'
import onError from '@modules/on-error'
import { removeTerminalJobsWhen } from '@data-stores/valkey-glide-mq/terminal-job-removal'
import { hasRecordedAiUsageResponseId } from '@services/ai-usage'
import { reconcileBackgroundResponse } from '@services/openai-background-responses'
import { getBackgroundResponseReconcilePageSize } from '@queues/ai-agents/config'
import { enqueueReconcileBackgroundResponsesPage } from '@queues/ai-agents/enqueues/reconcile-background-responses'
import { ai_agents } from '@queues/ai-agents/queues'
import type { AIAgentJobData, ReconcileBackgroundResponsesJobData } from '@queues/ai-agents/types'
import pMap from 'p-map'

const RECONCILE_CONCURRENCY = 5
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
  // The job may be retried while this sweep runs. Keep its payload untouched: the response key
  // is the accounting fence, and the active worker will clear its own pending IDs. Flatten the
  // page so the OpenAI retrieve/cancel limit is five across all retained jobs.
  await pMap(
    failed.flatMap(failedJob =>
      (failedJob.data.backgroundResponses ?? []).map(response => ({
        response,
        mode: reconciliationMode(failedJob),
      })),
    ),
    async ({ response, mode }) => {
      try {
        await reconcileBackgroundResponse(
          { ...response, createdAt: new Date(response.createdAt) },
          mode,
        )
      } catch (err) {
        reportReconcileFailure(err)
      }
    },
    { concurrency: RECONCILE_CONCURRENCY },
  )
  const removedStableJobs = await pMap(
    failed,
    async failedJob => {
      if (!hasReactivatableStableId(failedJob)) return 0
      // Release a stable id only after its retained responses settle. The native WATCH guard
      // rejects an operator retry race; the domain's durable request decides if another run starts.
      try {
        return await removeTerminalJobsWhen<AIAgentJobData>(
          deps.queue,
          [failedJob.id],
          canRemoveFailedJob,
        )
      } catch (err) {
        reportReconcileFailure(err)
        return 0
      }
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
  const removed = await removeTerminalJobsWhen<AIAgentJobData>(
    deps.queue,
    failed.map(entry => entry.id),
    canRemoveFailedJob,
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

async function canRemoveFailedJob(entry: Job<AIAgentJobData>): Promise<boolean> {
  const settled = await pMap(
    entry.data.backgroundResponses ?? [],
    async response => {
      try {
        if (await hasRecordedAiUsageResponseId(response.responseId)) return true
        const result = await reconcileBackgroundResponse(
          { ...response, createdAt: new Date(response.createdAt) },
          reconciliationMode(entry),
        )
        return result !== 'still-active' && result !== 'accounting-uncertain'
      } catch (err) {
        reportReconcileFailure(err)
        return false
      }
    },
    { concurrency: RECONCILE_CONCURRENCY },
  )
  return settled.every(Boolean)
}

function reportReconcileFailure(err: unknown): void {
  onError(
    err instanceof Error
      ? err
      : new Error('Background response reconciliation failed', { cause: err }),
  )
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

function reconciliationMode(job: Job<AIAgentJobData>): 'worker' | 'inline' {
  return job.name === 'recover-background-response' ? 'inline' : 'worker'
}
