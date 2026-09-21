import type { JobOptions } from 'glide-mq'
import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { AGENT_PRIORITY, AI_AGENTS_DEFAULTS, AI_AGENTS_QUEUE_NAME } from '../config.mts'
import { ai_agents } from '../queues.mts'

const enqueueReconcileJob = createEnqueueFunction<
  Record<string, never>,
  'reconcile-chat-runtime-generations'
>({
  queue: ai_agents,
  queueName: AI_AGENTS_QUEUE_NAME,
  jobName: 'reconcile-chat-runtime-generations',
})

export function enqueueReconcileChatRuntimeGenerations(): ReturnType<typeof enqueueReconcileJob> {
  return enqueueReconcileJob({}, {
    attempts: AI_AGENTS_DEFAULTS.attempts,
    backoff: AI_AGENTS_DEFAULTS.backoff,
    removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
    removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
    priority: AGENT_PRIORITY['reconcile-chat-runtime-generations'],
  } satisfies JobOptions)
}
