import { isDeepStrictEqual } from 'node:util'
import { createFeedbackEnvelope, type FeedbackEnvelope } from 'vouchington-tooling/agent-blackboard'

import {
  feedbackCoverage,
  feedbackOutcome,
  type FeedbackArgs,
} from '../blackboard/feedback-options.mts'

// The shared codec validates and canonicalizes the assembled envelope before any delivery.
export function retrospectiveEnvelope(
  value: unknown,
  parsed: FeedbackArgs & { repositories?: string[] },
  stagedRepositories: unknown,
): FeedbackEnvelope {
  const envelope = createFeedbackEnvelope(value as FeedbackEnvelope)
  if (
    stagedRepositories !== undefined &&
    !isDeepStrictEqual(stagedRepositories, envelope.repositories)
  )
    throw new Error('staged repositories must be canonical')
  feedbackOutcome(envelope.workOutcome, false)
  if (stagedRepositories !== undefined && parsed.repositories !== undefined) {
    const requested = createFeedbackEnvelope({ ...envelope, repositories: parsed.repositories })
    if (!isDeepStrictEqual(requested.repositories, envelope.repositories))
      throw new Error('--repository conflicts with staged repository attribution')
  }
  if (
    parsed.workOutcome !== undefined &&
    feedbackOutcome(parsed.workOutcome, false) !== envelope.workOutcome
  )
    throw new Error('--work-outcome conflicts with staged feedback metadata')
  const explicitCoverage = feedbackCoverage({
    ...parsed,
    coverageStatus: parsed.coverageStatus ?? envelope.feedbackCoverage.status,
    coverageSources: parsed.coverageSources ?? envelope.feedbackCoverage.sources,
    droppedCount: parsed.droppedCount ?? String(envelope.feedbackCoverage.droppedCount),
  })
  if (!isDeepStrictEqual(explicitCoverage, envelope.feedbackCoverage))
    throw new Error('explicit coverage flags conflict with staged feedback metadata')
  if (
    envelope.feedbackCoverage.status === 'complete' &&
    (/^Status: (?:unavailable|not assessed|partial)/m.test(envelope.markdown) ||
      !envelope.markdown.includes('## Tool Findings') ||
      !envelope.markdown.includes('## Architecture Findings'))
  )
    throw new Error(
      'complete feedback coverage requires available assessed factual, tool, and architecture sources',
    )
  return envelope
}
