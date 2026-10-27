import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import type { JobOptions } from 'glide-mq'
import { AGENT_PRIORITY, AI_AGENTS_DEFAULTS, AI_AGENTS_QUEUE_NAME } from '../config.mts'
import { ai_agents } from '../queues.mts'
import type { ReconcileClassifierRunsJobData } from '../types.mts'
import { failedAiJobHasNoPendingResponses } from './failed-job-recovery.mts'

const enqueue = createEnqueueFunction<ReconcileClassifierRunsJobData, 'reconcile-classifier-runs'>({
  queue: ai_agents,
  queueName: AI_AGENTS_QUEUE_NAME,
  jobName: 'reconcile-classifier-runs',
})

/** The tick that starts a sweep from its first page. */
export function enqueueReconcileClassifierRuns(): ReturnType<typeof enqueue> {
  return enqueue({}, {
    ...AI_AGENTS_DEFAULTS,
    priority: AGENT_PRIORITY['reconcile-classifier-runs'],
  } satisfies JobOptions)
}

/**
 * The next page of a sweep. The page identity is the job id, so overlapping sweeps that reach the
 * same page while it is still queued add it once; a completed page may run again, which is safe
 * because every dispatch beneath it is idempotent.
 */
export async function enqueueReconcileClassifierRunsPage(
  data: ReconcileClassifierRunsJobData & { phase: 'incomplete' | 'requests' },
): Promise<Awaited<ReturnType<typeof enqueue>>> {
  const added = await enqueueBulkReactivatingFinished({
    queue: ai_agents,
    inputs: [data],
    jobIdOf: reconcileClassifierRunsPageJobId,
    enqueueBulk: async inputs => {
      const page = inputs[0]
      if (!page) return []
      const job = await enqueue(page, {
        ...AI_AGENTS_DEFAULTS,
        priority: AGENT_PRIORITY['reconcile-classifier-runs'],
        jobId: reconcileClassifierRunsPageJobId(page),
        removeOnComplete: true,
        removeOnFail: false,
      } satisfies JobOptions)
      return job ? [job] : []
    },
    canRemoveFailed: failedAiJobHasNoPendingResponses,
  })
  return added[0] ?? null
}

function reconcileClassifierRunsPageJobId(
  data: ReconcileClassifierRunsJobData & { phase: 'incomplete' | 'requests' },
): string {
  return `reconcile_classifier_runs_${data.phase}_${data.classifier ?? 'all'}_${data.after ?? 'start'}`
}
