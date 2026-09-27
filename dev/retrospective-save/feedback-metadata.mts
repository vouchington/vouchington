import { isDeepStrictEqual } from 'node:util'
import {
  createFeedbackEnvelope,
  validateFeedbackEnvelope,
  type FeedbackEnvelope,
} from 'vouchington-tooling/agent-blackboard'

import {
  feedbackCoverage,
  feedbackOutcome,
  type FeedbackArgs,
} from '../blackboard/feedback-options.mts'

// The shared codec validates generated metadata before any delivery; CLI flags may only confirm it.
export function retrospectiveEnvelope(value: unknown, parsed: FeedbackArgs): FeedbackEnvelope {
  validateFeedbackEnvelope(value)
  feedbackOutcome(value.workOutcome, false)
  if (
    parsed.workOutcome !== undefined &&
    feedbackOutcome(parsed.workOutcome, false) !== value.workOutcome
  )
    throw new Error('--work-outcome conflicts with staged feedback metadata')
  const explicitCoverage = feedbackCoverage({
    ...parsed,
    coverageStatus: parsed.coverageStatus ?? value.feedbackCoverage.status,
    coverageSources: parsed.coverageSources ?? value.feedbackCoverage.sources,
    droppedCount: parsed.droppedCount ?? String(value.feedbackCoverage.droppedCount),
  })
  if (!isDeepStrictEqual(explicitCoverage, value.feedbackCoverage))
    throw new Error('explicit coverage flags conflict with staged feedback metadata')
  if (
    value.feedbackCoverage.status === 'complete' &&
    (/^Status: (?:unavailable|not assessed|partial)/m.test(value.markdown) ||
      !value.markdown.includes('## Tool Findings') ||
      !value.markdown.includes('## Architecture Findings'))
  )
    throw new Error(
      'complete feedback coverage requires available assessed factual, tool, and architecture sources',
    )
  return createFeedbackEnvelope(value)
}
