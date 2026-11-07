import {
  AI_AGENTS_DEFAULTS,
  AGENT_PRIORITY,
  getBackgroundResponseRecoveryConcurrency,
} from '../config.mts'
import type { JobBackgroundResponse } from '../types.mts'
import { createAIAgentEnqueue } from './create-enqueue.mts'

export const BACKGROUND_RESPONSE_RECOVERY_DELAY_MS = 3 * 60_000

export function backgroundResponseRecoveryJobId(responseId: string): string {
  return `ai_background_response_recovery_${responseId}`
}

const enqueueRecovery = createAIAgentEnqueue('recover-background-response')

/** Admits a delayed job to check an inline call's response; the hook awaits admission. */
export function enqueueRecoverBackgroundResponse(response: JobBackgroundResponse) {
  return enqueueRecovery(
    {
      backgroundResponses: [response],
    },
    {
      ...AI_AGENTS_DEFAULTS,
      removeOnComplete: true,
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
