import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { AI_AGENTS_QUEUE_NAME, AI_AGENTS_DEFAULTS, AGENT_PRIORITY } from '../config.mts'
import { ai_agents } from '../queues.mts'
import type { AutoDispatchJudgementJobData } from '../types.mts'

const enqueueAutoDispatchJudgementJob = createEnqueueFunction<
  AutoDispatchJudgementJobData,
  'auto-dispatch-judgement'
>({
  queue: ai_agents,
  queueName: AI_AGENTS_QUEUE_NAME,
  jobName: 'auto-dispatch-judgement',
})

export function enqueueAutoDispatchJudgement(
  data: AutoDispatchJudgementJobData,
): ReturnType<typeof enqueueAutoDispatchJudgementJob> {
  return enqueueAutoDispatchJudgementJob(data, {
    attempts: AI_AGENTS_DEFAULTS.attempts,
    backoff: AI_AGENTS_DEFAULTS.backoff,
    removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
    removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
    priority: AGENT_PRIORITY['auto-dispatch-judgement'],
    deduplication: {
      id: `auto_dispatch_judgement_${data.judgement_id}`,
      mode: 'simple',
    },
  })
}
