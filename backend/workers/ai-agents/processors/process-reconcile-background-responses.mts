import type { Job, Queue } from 'glide-mq'
import onError from '@modules/on-error'
import { removeTerminalJobsWhen } from '@data-stores/valkey-glide-mq/terminal-job-removal'
import { hasRecordedAiUsageResponseId } from '@services/ai-usage'
import {
  getAgedBackgroundResponses,
  getOpenaiBackgroundResponsesWorkLimit,
  reconcileAgedBackgroundResponse,
  reconcileBackgroundResponse,
} from '@services/openai-background-responses'
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

/** One bounded page of inline rows and one bounded page of retained failed jobs per job. */
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
  if (!job.data.phase || job.data.phase === 'inline') {
    const inlinePageSize = getOpenaiBackgroundResponsesWorkLimit('reconcile_batch_size')
    const rows = await getAgedBackgroundResponses({
      batchSize: inlinePageSize,
      after: job.data.inlineAfter,
    })
    await pMap(rows, row => reconcileAgedBackgroundResponse(row).catch(onError), {
      concurrency: RECONCILE_CONCURRENCY,
      stopOnError: false,
    })
    if (rows.length === inlinePageSize) {
      await deps.enqueuePage({
        phase: 'inline',
        inlineAfter: rows.at(-1)!.id,
        sweepId,
        page: (job.data.page ?? 0) + 1,
      })
      return
    }
  }
  const offset = job.data.failedOffset ?? 0
  const pageSize = getOpenaiBackgroundResponsesWorkLimit('reconcile_batch_size')
  const failed = await deps.queue.getJobs('failed', offset, offset + pageSize - 1)
  // The job may be retried while this sweep runs. Keep its payload untouched: the response key
  // is the accounting fence, and the active worker will clear its own pending IDs. Flatten the
  // page so the OpenAI retrieve/cancel limit is five across all retained jobs.
  await pMap(
    failed.flatMap(failedJob => failedJob.data.backgroundResponses ?? []),
    response =>
      reconcileBackgroundResponse({ ...response, createdAt: new Date(response.createdAt) }, 'job'),
    { concurrency: RECONCILE_CONCURRENCY, stopOnError: false },
  )
  const removedClassifiers = await pMap(
    failed,
    failedJob => {
      if (failedJob.name !== 'classifier-run') return 0
      // A classifier has a stable queue id. Release its failed record as soon as every retained
      // OpenAI response is terminal, so the durable classifier run sweep can enqueue the next
      // receipt-bound attempt. The native WATCH guard rejects an operator retry race.
      return removeTerminalJobsWhen<AIAgentJobData>(deps.queue, [failedJob.id], canRemoveFailedJob)
    },
    { concurrency: 1, stopOnError: false },
  )
  const removed = removedClassifiers.reduce((sum, value) => sum + value, 0)
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
  const pageSize = Math.min(
    getOpenaiBackgroundResponsesWorkLimit('reconcile_batch_size'),
    excess - offset,
  )
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
      if (await hasRecordedAiUsageResponseId(response.responseId)) return true
      const result = await reconcileBackgroundResponse(
        { ...response, createdAt: new Date(response.createdAt) },
        'job',
      )
      return result !== 'still-active' && result !== 'accounting-uncertain'
    },
    { concurrency: RECONCILE_CONCURRENCY, stopOnError: false },
  )
  return settled.every(Boolean)
}
