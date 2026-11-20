import type { JobOptions } from 'glide-mq'
import { AI_AGENTS_DEFAULTS, AGENT_PRIORITY } from '../config.mts'
import { createAIAgentEnqueue } from './create-enqueue.mts'

const enqueueExpireAppealRuns = createAIAgentEnqueue('expire-stuck-appeal-resolution-runs')
const enqueueExpireDisputeRuns = createAIAgentEnqueue('expire-stuck-dispute-resolution-runs')

function options(
  name: 'expire-stuck-appeal-resolution-runs' | 'expire-stuck-dispute-resolution-runs',
) {
  return {
    attempts: AI_AGENTS_DEFAULTS.attempts,
    backoff: AI_AGENTS_DEFAULTS.backoff,
    removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
    removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
    priority: AGENT_PRIORITY[name],
  } satisfies JobOptions
}

export function enqueueExpireStuckAppealResolutionRuns(): ReturnType<
  typeof enqueueExpireAppealRuns
> {
  return enqueueExpireAppealRuns({}, options('expire-stuck-appeal-resolution-runs'))
}

export function enqueueExpireStuckDisputeResolutionRuns(): ReturnType<
  typeof enqueueExpireDisputeRuns
> {
  return enqueueExpireDisputeRuns({}, options('expire-stuck-dispute-resolution-runs'))
}
