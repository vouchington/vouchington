import type { CopyrightAgentSweepData } from '../types.mts'
import type { JobOptions } from 'glide-mq'
import { AGENT_PRIORITY, AI_AGENTS_DEFAULTS } from '../config.mts'
import { createAIAgentEnqueue } from './create-enqueue.mts'

const enqueue = createAIAgentEnqueue('reconcile-copyright-agent-dispatches')

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
