import type { Job } from 'glide-mq'
import pMap from 'p-map'
import onError from '@modules/on-error'
import { aiAgentsQueueMaxValues, getFailedJobReconcileLimits } from '@queues/ai-agents/config'
import { ai_agents } from '@queues/ai-agents/queues'
import type {
  AIAgentJobData,
  AppealResolutionJobData,
  ReportJudgementJobData,
} from '@queues/ai-agents/types'
import { markAppealResolutionRunsFailed } from '@services/moderation-appeals/rerun-outcomes'
import { markReportJudgementRunsFailed } from '@services/moderation-reports/rerun-outcomes'

type FailedJob = Job<AIAgentJobData>
type FailedEntry = { job: FailedJob; index: number }

export type ReconcileAIAgentFailuresOptions = {
  /** Exact queue jobs for a bounded operator or test pass. */
  jobIds?: readonly string[]
  batchSize?: number
  historyLimit?: number
}

export type ReconcileAIAgentFailuresResult = {
  scanned: number
  terminalized: number
  removed: number
  hasMore: boolean
}

/** Persists manual failure evidence before removing it; ordinary failures keep a bounded history. */
export async function processReconcileAIAgentFailures(
  options: ReconcileAIAgentFailuresOptions = {},
): Promise<ReconcileAIAgentFailuresResult> {
  const configured = getFailedJobReconcileLimits()
  const batchSize = boundedPositive(
    options.batchSize,
    configured.batchSize,
    aiAgentsQueueMaxValues.failed_job_reconcile_batch_size,
  )
  const historyLimit = boundedPositive(
    options.historyLimit,
    configured.historyLimit,
    aiAgentsQueueMaxValues.failed_job_history_limit,
  )
  const failedCount = (await ai_agents.getJobCounts()).failed
  const headLimit = batchSize + historyLimit
  const head = options.jobIds
    ? await pMap(options.jobIds.slice(0, headLimit), id => ai_agents.getJob(id), {
        concurrency: batchSize,
      })
    : await ai_agents.getJobs('failed', 0, headLimit - 1)
  // A manual marker blocked on PostgreSQL can occupy the head indefinitely. A second bounded
  // window before the preserved history still retires ordinary failures during that outage.
  const tailStart = Math.max(0, failedCount - historyLimit - batchSize)
  const tailEnd = failedCount - historyLimit - 1
  const tail =
    !options.jobIds && tailEnd >= tailStart
      ? await ai_agents.getJobs('failed', tailStart, tailEnd)
      : []
  const seen = new Set<string>()
  const viewed: Array<{ job: FailedJob | null; index: number }> = []
  for (const [index, job] of head.entries()) {
    if (job && !seen.has(job.id)) {
      seen.add(job.id)
      viewed.push({ job, index })
    }
  }
  for (const [offset, job] of tail.entries()) {
    if (!seen.has(job.id)) {
      seen.add(job.id)
      viewed.push({ job, index: tailStart + offset })
    }
  }
  const states = await pMap(
    viewed,
    async ({ job, index }): Promise<FailedEntry | null> =>
      job && (await job.getState()) === 'failed' ? { job, index } : null,
    { concurrency: batchSize },
  )
  const confirmed = states.filter((entry): entry is FailedEntry => entry !== null)
  const ordinaryCutoff = Math.max(0, failedCount - historyLimit)
  const ordinary: FailedEntry[] = []
  const manual: FailedEntry[] = []
  for (const entry of confirmed) {
    if (manualKind(entry.job)) {
      if (entry.index < head.length) manual.push(entry)
    } else if (!options.jobIds && entry.index < ordinaryCutoff) ordinary.push(entry)
  }
  const selected = [...ordinary.slice(0, batchSize), ...manual.slice(0, batchSize)]
  const ordinaryJobs: FailedJob[] = []
  const reportJobs: FailedJob[] = []
  const appealJobs: FailedJob[] = []
  for (const { job } of selected) {
    const kind = manualKind(job)
    if (kind === 'report') reportJobs.push(job)
    else if (kind === 'appeal') appealJobs.push(job)
    else ordinaryJobs.push(job)
  }

  let removed = await removeAcknowledged(ordinaryJobs, batchSize)
  let terminalized = 0
  let markerFailed = false
  if (reportJobs.length > 0) {
    try {
      terminalized += await markReportJudgementRunsFailed(
        reportJobs.map(job => {
          const data = job.data as ReportJudgementJobData
          return { reportId: data.triggering_report_id, runId: data.run_id! }
        }),
      )
      removed += await removeAcknowledged(reportJobs, batchSize)
    } catch (err) {
      markerFailed = true
      onError(asError(err))
    }
  }
  if (appealJobs.length > 0) {
    try {
      terminalized += await markAppealResolutionRunsFailed(
        appealJobs.map(job => {
          const data = job.data as AppealResolutionJobData
          return { appealId: data.appeal_id, requestToken: data.ai_draft_request_token }
        }),
      )
      removed += await removeAcknowledged(appealJobs, batchSize)
    } catch (err) {
      markerFailed = true
      onError(asError(err))
    }
  }
  return {
    scanned: viewed.length,
    terminalized,
    removed,
    hasMore:
      markerFailed ||
      selected.length > removed ||
      ordinary.length >= batchSize ||
      manual.length >= batchSize ||
      (options.jobIds ? options.jobIds.length > head.length : failedCount - removed > historyLimit),
  }
}

function manualKind(job: FailedJob): 'report' | 'appeal' | null {
  if (job.name === 'report-judgement') {
    const data = job.data as ReportJudgementJobData
    if (data.rerun_by_id && data.run_id) return 'report'
  } else if (job.name === 'appeal-resolution') {
    const data = job.data as AppealResolutionJobData
    if (data.rerun_by_id && data.ai_draft_request_token) return 'appeal'
  }
  return null
}

async function removeAcknowledged(jobs: readonly FailedJob[], batchSize: number): Promise<number> {
  const results = await pMap(
    jobs,
    async job => {
      try {
        await job.remove()
        return true
      } catch (err) {
        onError(asError(err))
        return false
      }
    },
    { concurrency: batchSize },
  )
  return results.filter(Boolean).length
}

function boundedPositive(value: number | undefined, fallback: number, max: number): number {
  return value && Number.isInteger(value) && value > 0 ? Math.min(value, max) : fallback
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value), { cause: value })
}
