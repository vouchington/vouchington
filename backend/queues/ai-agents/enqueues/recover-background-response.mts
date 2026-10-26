import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import {
  AI_AGENTS_QUEUE_NAME,
  AI_AGENTS_DEFAULTS,
  AGENT_PRIORITY,
  getBackgroundResponseRecoveryConcurrency,
} from '../config.mts'
import { ai_agents } from '../queues.mts'
import type { BackgroundResponseJobData, JobBackgroundResponse } from '../types.mts'

export const BACKGROUND_RESPONSE_RECOVERY_DELAY_MS = 3 * 60_000

export function backgroundResponseRecoveryJobId(responseId: string): string {
  return `ai_background_response_recovery_${responseId}`
}

const enqueueRecovery = createEnqueueFunction<
  BackgroundResponseJobData,
  'recover-background-response'
>({
  queue: ai_agents,
  queueName: AI_AGENTS_QUEUE_NAME,
  jobName: 'recover-background-response',
})

/** The response-created hook awaits admission; the ledger response key fences normal completion. */
export function enqueueRecoverBackgroundResponse(response: JobBackgroundResponse) {
  return enqueueRecovery(
    {
      backgroundResponses: [response],
      // This job owns settlement only. It must never dispatch another paid model request.
      backgroundResponseProcessorCompleted: true,
    },
    {
      ...AI_AGENTS_DEFAULTS,
      removeOnComplete: true,
      removeOnFail: false,
      delay: BACKGROUND_RESPONSE_RECOVERY_DELAY_MS,
      jobId: backgroundResponseRecoveryJobId(response.responseId),
      priority: AGENT_PRIORITY['recover-background-response'],
      ordering: {
        key: 'ai_background_response_recovery',
        concurrency: getBackgroundResponseRecoveryConcurrency(),
      },
    },
  )
}
