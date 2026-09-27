import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { JobOptions } from 'glide-mq'
import { AGENT_PRIORITY, AI_AGENTS_DEFAULTS, AI_AGENTS_QUEUE_NAME } from '../config.mts'
import { ai_agents } from '../queues.mts'

const enqueue = createEnqueueFunction<
  Record<string, never>,
  'reconcile-post-classifier-applications'
>({
  queue: ai_agents,
  queueName: AI_AGENTS_QUEUE_NAME,
  jobName: 'reconcile-post-classifier-applications',
})

export function enqueueReconcilePostClassifierApplications(): ReturnType<typeof enqueue> {
  return enqueue({}, {
    ...AI_AGENTS_DEFAULTS,
    priority: AGENT_PRIORITY['reconcile-post-classifier-applications'],
  } satisfies JobOptions)
}
