import type { JobOptions } from 'glide-mq'
import { AI_AGENTS_DEFAULTS, AGENT_PRIORITY } from '../config.mts'
import { createAIAgentEnqueue } from './create-enqueue.mts'

const enqueueReconcileJob = createAIAgentEnqueue('reconcile-auto-dispatch-judgements')

export function enqueueReconcileAutoDispatchJudgements(): ReturnType<typeof enqueueReconcileJob> {
  return enqueueReconcileJob({}, {
    attempts: AI_AGENTS_DEFAULTS.attempts,
    backoff: AI_AGENTS_DEFAULTS.backoff,
    removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
    removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
    priority: AGENT_PRIORITY['reconcile-auto-dispatch-judgements'],
  } satisfies JobOptions)
}
