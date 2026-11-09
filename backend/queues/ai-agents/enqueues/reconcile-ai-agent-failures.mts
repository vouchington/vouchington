import type { JobOptions } from 'glide-mq'
import { AGENT_PRIORITY, AI_AGENTS_DEFAULTS } from '../config.mts'
import { createAIAgentEnqueue } from './create-enqueue.mts'

const enqueueReconcileJob = createAIAgentEnqueue('reconcile-ai-agent-failures')

export function enqueueReconcileAIAgentFailures(): ReturnType<typeof enqueueReconcileJob> {
  return enqueueReconcileJob({}, {
    attempts: AI_AGENTS_DEFAULTS.attempts,
    backoff: AI_AGENTS_DEFAULTS.backoff,
    removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
    removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
    priority: AGENT_PRIORITY['reconcile-ai-agent-failures'],
    deduplication: { id: 'reconcile_ai_agent_failures', mode: 'simple' },
  } satisfies JobOptions)
}
