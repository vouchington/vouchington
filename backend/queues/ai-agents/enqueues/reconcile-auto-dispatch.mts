import type { JobOptions } from 'glide-mq'
import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { AI_AGENTS_QUEUE_NAME, AI_AGENTS_DEFAULTS, AGENT_PRIORITY } from '../config.mts'
import { ai_agents } from '../queues.mts'

const enqueueReconcileJob = createEnqueueFunction<
  Record<string, never>,
  'reconcile-auto-dispatch-judgements'
>({
  queue: ai_agents,
  queueName: AI_AGENTS_QUEUE_NAME,
  jobName: 'reconcile-auto-dispatch-judgements',
})

export function enqueueReconcileAutoDispatchJudgements(): ReturnType<typeof enqueueReconcileJob> {
  return enqueueReconcileJob({}, {
    attempts: AI_AGENTS_DEFAULTS.attempts,
    backoff: AI_AGENTS_DEFAULTS.backoff,
    removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
    removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
    priority: AGENT_PRIORITY['reconcile-auto-dispatch-judgements'],
  } satisfies JobOptions)
}
