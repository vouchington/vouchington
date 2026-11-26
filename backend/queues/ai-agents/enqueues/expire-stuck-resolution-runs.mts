import type { JobOptions } from 'glide-mq'
import { AI_AGENTS_DEFAULTS, AGENT_PRIORITY } from '../config.mts'
import { createAIAgentEnqueue } from './create-enqueue.mts'

const enqueueExpireReportRuns = createAIAgentEnqueue('expire-stuck-report-judgement-runs')
const enqueueExpireCopyrightEmailRuns = createAIAgentEnqueue('expire-stuck-copyright-email-runs')
const enqueueExpireCopyrightAppealRuns = createAIAgentEnqueue('expire-stuck-copyright-appeal-runs')
const enqueueExpireCopyrightGuidanceRuns = createAIAgentEnqueue(
  'expire-stuck-copyright-guidance-runs',
)
const enqueueExpireAppealRuns = createAIAgentEnqueue('expire-stuck-appeal-resolution-runs')
const enqueueExpireDisputeRuns = createAIAgentEnqueue('expire-stuck-dispute-resolution-runs')

function options(
  name:
    | 'expire-stuck-report-judgement-runs'
    | 'expire-stuck-copyright-email-runs'
    | 'expire-stuck-copyright-appeal-runs'
    | 'expire-stuck-copyright-guidance-runs'
    | 'expire-stuck-appeal-resolution-runs'
    | 'expire-stuck-dispute-resolution-runs',
) {
  return {
    attempts: AI_AGENTS_DEFAULTS.attempts,
    backoff: AI_AGENTS_DEFAULTS.backoff,
    removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
    removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
    priority: AGENT_PRIORITY[name],
  } satisfies JobOptions
}

export function enqueueExpireStuckReportJudgementRuns(): ReturnType<
  typeof enqueueExpireReportRuns
> {
  return enqueueExpireReportRuns({}, options('expire-stuck-report-judgement-runs'))
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

export function enqueueExpireStuckCopyrightEmailRuns(): ReturnType<
  typeof enqueueExpireCopyrightEmailRuns
> {
  return enqueueExpireCopyrightEmailRuns({}, options('expire-stuck-copyright-email-runs'))
}

export function enqueueExpireStuckCopyrightAppealRuns(): ReturnType<
  typeof enqueueExpireCopyrightAppealRuns
> {
  return enqueueExpireCopyrightAppealRuns({}, options('expire-stuck-copyright-appeal-runs'))
}

export function enqueueExpireStuckCopyrightGuidanceRuns(): ReturnType<
  typeof enqueueExpireCopyrightGuidanceRuns
> {
  return enqueueExpireCopyrightGuidanceRuns({}, options('expire-stuck-copyright-guidance-runs'))
}
