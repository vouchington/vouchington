import type { CopyrightAgentSweepData } from '../types.mts'
import type { JobOptions } from 'glide-mq'
import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { AGENT_PRIORITY, AI_AGENTS_DEFAULTS, AI_AGENTS_QUEUE_NAME } from '../config.mts'
import { ai_agents } from '../queues.mts'

const enqueue = createEnqueueFunction<
  CopyrightAgentSweepData,
  'reconcile-copyright-agent-dispatches'
>({
  queue: ai_agents,
  queueName: AI_AGENTS_QUEUE_NAME,
  jobName: 'reconcile-copyright-agent-dispatches',
})

export function enqueueReconcileCopyrightAgentDispatches(
  data: CopyrightAgentSweepData = {},
): ReturnType<typeof enqueue> {
  return enqueue(data, {
    ...AI_AGENTS_DEFAULTS,
    priority: AGENT_PRIORITY['reconcile-copyright-agent-dispatches'],
    deduplication: {
      id: `copyright-agent-sweep:${data.after ?? 'root'}`,
      mode: 'throttle',
      ttl: 60_000,
    },
  } satisfies JobOptions)
}
