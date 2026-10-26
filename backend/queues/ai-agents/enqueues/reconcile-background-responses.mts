import type { JobOptions } from 'glide-mq'
import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import {
  AI_AGENTS_QUEUE_NAME,
  AI_AGENTS_DEFAULTS,
  AGENT_PRIORITY,
  getBackgroundResponseReconcileConcurrency,
} from '../config.mts'
import { ai_agents } from '../queues.mts'
import type { ReconcileBackgroundResponsesJobData } from '../types.mts'

const enqueueReconcileJob = createEnqueueFunction<
  ReconcileBackgroundResponsesJobData,
  'reconcile-background-responses'
>({
  queue: ai_agents,
  queueName: AI_AGENTS_QUEUE_NAME,
  jobName: 'reconcile-background-responses',
})

export function enqueueReconcileBackgroundResponses(): ReturnType<typeof enqueueReconcileJob> {
  return enqueueReconcileJob({}, {
    attempts: AI_AGENTS_DEFAULTS.attempts,
    backoff: AI_AGENTS_DEFAULTS.backoff,
    removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
    removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
    priority: AGENT_PRIORITY['reconcile-background-responses'],
    ordering: {
      key: 'ai_background_response_reconcile',
      concurrency: getBackgroundResponseReconcileConcurrency(),
    },
  } satisfies JobOptions)
}

/** One bounded page of retained failed AI jobs, or a bounded cleanup page. */
export function enqueueReconcileBackgroundResponsesPage(
  data: ReconcileBackgroundResponsesJobData & {
    phase: 'inline' | 'failed' | 'cleanup'
    sweepId: string
    page: number
  },
): ReturnType<typeof enqueueReconcileJob> {
  return enqueueReconcileJob(data, {
    attempts: AI_AGENTS_DEFAULTS.attempts,
    backoff: AI_AGENTS_DEFAULTS.backoff,
    removeOnComplete: true,
    removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
    priority: AGENT_PRIORITY['reconcile-background-responses'],
    ordering: {
      key: 'ai_background_response_reconcile',
      concurrency: getBackgroundResponseReconcileConcurrency(),
    },
    jobId: `ai_background_response_reconcile_${data.sweepId}_${data.phase}_${data.page}`,
  } satisfies JobOptions)
}
