import {
  lockApprovedPostClassifierInput,
  lockRssFeedItemClassifierInput,
  type ClassifierRunAdapter,
} from '@services/classifier-runs'
import { AUTOTAGGER_AGENT_SLUG } from '@voucha/types/entities/autotagger-agent'
import { captureAutotaggerAgentCandidateTopicIds } from './candidates.mts'
import {
  resolveAutotaggerAgentRunConfiguration,
  type AutotaggerAgentRunConfiguration,
} from './configuration.mts'
import { applyAutotaggerAgentEffects, type AutotaggerAgentEffects } from './effects.mts'
import {
  persistAutotaggerAgentFacts,
  readAutotaggerAgentFacts,
  validateAutotaggerAgentFacts,
  type AutotaggerAgentFacts,
} from './facts.mts'
import { autotaggerAgentRequestEligibility, hasCompletedFirstStage } from './readiness.mts'

export type AutotaggerAgentRunAdapter = ClassifierRunAdapter<
  AutotaggerAgentRunConfiguration,
  AutotaggerAgentFacts,
  AutotaggerAgentEffects
>

/**
 * The C7 adapter: the scoped reasoning autotagger that runs after C6. It reads the same subject
 * input as the first stage (so a post or feed item is eligible for it exactly when it is for C6),
 * waits for the first stage's completed result at that content, lets a bounded tool-using agent
 * decide which of the paid-followed topics the first stage did not apply are true of the content,
 * and adds only those. Its facts are the run's local outcome: it reserves no decision batch and has
 * no jev model or thresholds. The shared classifier-run lifecycle owns receipt, lease, attempts,
 * terminal failure, completion, supersession and sweep.
 */
export function createAutotaggerAgentRunAdapter(): AutotaggerAgentRunAdapter {
  return {
    slug: AUTOTAGGER_AGENT_SLUG,
    lockCurrent: (query, subject) =>
      subject.postId !== null
        ? lockApprovedPostClassifierInput(query, subject)
        : lockRssFeedItemClassifierInput(query, subject),
    resolve: (_subject, _current, query) => resolveAutotaggerAgentRunConfiguration(query),
    captureCandidates: (query, subject) => captureAutotaggerAgentCandidateTopicIds(query, subject),
    ready: hasCompletedFirstStage,
    requestEligibility: autotaggerAgentRequestEligibility,
    validateLocal: validateAutotaggerAgentFacts,
    persistLocal: persistAutotaggerAgentFacts,
    readLocal: readAutotaggerAgentFacts,
    applyEffects: applyAutotaggerAgentEffects,
  }
}
