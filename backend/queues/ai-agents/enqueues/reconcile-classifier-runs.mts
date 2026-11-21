import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { Job, JobOptions } from 'glide-mq'
import { AGENT_PRIORITY, AI_AGENTS_DEFAULTS, AI_AGENTS_QUEUE_NAME } from '../config.mts'
import { ai_agents } from '../queues.mts'
import type { ReconcileClassifierRunsJobData } from '../types.mts'
import { createAIAgentEnqueue } from './create-enqueue.mts'

const enqueue = createAIAgentEnqueue('reconcile-classifier-runs')

/** The tick that starts a sweep from its first page. */
export function enqueueReconcileClassifierRuns(): Promise<Job<ReconcileClassifierRunsJobData> | null> {
  return enqueue({}, {
    ...AI_AGENTS_DEFAULTS,
    priority: AGENT_PRIORITY['reconcile-classifier-runs'],
  } satisfies JobOptions)
}

type ReconcileClassifierRunsPageData = ReconcileClassifierRunsJobData & {
  phase: 'incomplete' | 'requests'
}

function buildReconcileClassifierRunsPageJob(data: ReconcileClassifierRunsPageData): {
  data: ReconcileClassifierRunsJobData
  opts: JobOptions
} {
  return {
    data,
    opts: {
      ...AI_AGENTS_DEFAULTS,
      priority: AGENT_PRIORITY['reconcile-classifier-runs'],
      jobId: `reconcile_classifier_runs_${data.phase}_${data.classifier ?? 'all'}_${data.after ?? 'start'}`,
      removeOnComplete: true,
      removeOnFail: true,
    } satisfies JobOptions,
  }
}

const enqueuePagesBatch = createBulkEnqueueFunction({
  queue: ai_agents,
  queueName: AI_AGENTS_QUEUE_NAME,
  jobName: 'reconcile-classifier-runs',
  buildJob: buildReconcileClassifierRunsPageJob,
})

/**
 * The next page of a sweep. The page identity is the job id, so overlapping sweeps that reach the
 * same page while it is still queued add it once; a completed page may run again, which is safe
 * because every dispatch beneath it is idempotent.
 */
export function enqueueReconcileClassifierRunsPage(
  data: ReconcileClassifierRunsPageData,
): Promise<Job<ReconcileClassifierRunsJobData> | null> {
  const job = buildReconcileClassifierRunsPageJob(data)
  return enqueue(job.data, job.opts)
}

/** Adds the first request page of every classifier in one call; an existing page is skipped. */
export function enqueueBulkReconcileClassifierRunsPages(
  pages: readonly ReconcileClassifierRunsPageData[],
): ReturnType<typeof enqueuePagesBatch> {
  return enqueuePagesBatch([...pages])
}
