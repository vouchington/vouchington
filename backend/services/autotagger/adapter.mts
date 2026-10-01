import {
  lockApprovedPostClassifierInput,
  lockRssFeedItemClassifierInput,
  type ClassifierRunAdapter,
} from '@services/classifier-runs'
import { TAGGING_CLASSIFIER_SLUG } from '@voucha/types/entities/tagging-classifier'
import { captureAutotaggerCandidateTopicIds } from './candidates.mts'
import {
  resolveAutotaggerRunConfiguration,
  type AutotaggerRunConfiguration,
} from './configuration.mts'
import { applyAutotaggerEffects, type AutotaggerEffects } from './effects.mts'
import { autotaggerRequestEligibility, hasCurrentAutotaggerEmbedding } from './readiness.mts'

export type AutotaggerRunAdapter = ClassifierRunAdapter<
  AutotaggerRunConfiguration,
  never,
  AutotaggerEffects
>

/**
 * The C6 adapter: how a post's or feed item's current input is read, which topics a new receipt
 * captures, and how the durable decision becomes topic relations on that subject. The shared
 * classifier-run lifecycle
 * owns receipt, lease, attempts, terminal failure, completion, supersession and sweep.
 */
export function createAutotaggerRunAdapter(): AutotaggerRunAdapter {
  return {
    slug: TAGGING_CLASSIFIER_SLUG,
    lockCurrent: (query, subject) =>
      subject.postId !== null
        ? lockApprovedPostClassifierInput(query, subject)
        : lockRssFeedItemClassifierInput(query, subject),
    resolve: (_subject, _current, query) => resolveAutotaggerRunConfiguration(query),
    captureCandidates: (query, subject) => captureAutotaggerCandidateTopicIds(query, subject),
    ready: hasCurrentAutotaggerEmbedding,
    requestEligibility: autotaggerRequestEligibility,
    applyEffects: applyAutotaggerEffects,
  }
}
