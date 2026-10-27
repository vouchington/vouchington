import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { JobOptions } from 'glide-mq'
import { AGENT_PRIORITY, AI_AGENTS_DEFAULTS, AI_AGENTS_QUEUE_NAME } from '../config.mts'
import { ai_agents } from '../queues.mts'
import type { ReconcileClassifierRunsJobData } from '../types.mts'

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
export function enqueueReconcileClassifierRunsPage(
  data: ReconcileClassifierRunsJobData & { phase: 'incomplete' | 'requests' },
): ReturnType<typeof enqueue> {
  return enqueue(data, {
    ...AI_AGENTS_DEFAULTS,
    priority: AGENT_PRIORITY['reconcile-classifier-runs'],
    jobId: `reconcile_classifier_runs_${data.phase}_${data.classifier ?? 'all'}_${data.after ?? 'start'}`,
    removeOnComplete: true,
    removeOnFail: true,
  } satisfies JobOptions)
}
