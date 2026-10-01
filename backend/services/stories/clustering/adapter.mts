import {
  lockRssFeedItemClassifierInput,
  type ClassifierRunAdapter,
} from '@services/classifier-runs'
import { STORY_CLUSTERING_CLASSIFIER_SLUG } from '@voucha/types/entities/story-clustering-classifier'
import { captureStoryClusteringCandidates } from './candidates.mts'
import {
  resolveStoryClusteringRunConfiguration,
  type StoryClusteringRunConfiguration,
} from './configuration.mts'
import { applyStoryClusteringEffects } from './effects.mts'
import type { StoryClusteringEffects } from './membership.mts'
import {
  hasCurrentStoryClusteringEmbedding,
  storyClusteringRequestEligibility,
} from './readiness.mts'

export type { StoryClusteringEffects }

export type StoryClusteringRunAdapter = ClassifierRunAdapter<
  StoryClusteringRunConfiguration,
  never,
  StoryClusteringEffects
>

/**
 * The C9 adapter: how an RSS item's current content is read, which stories and standalone items a
 * new receipt captures as candidates, and how the durable Choice decision becomes story membership.
 * The shared classifier-run lifecycle owns receipt, lease, attempts, terminal failure, completion,
 * supersession and sweep, so one item version costs at most one model call however many candidates
 * the embedding search finds.
 */
export function createStoryClusteringRunAdapter(): StoryClusteringRunAdapter {
  return {
    slug: STORY_CLUSTERING_CLASSIFIER_SLUG,
    lockCurrent: lockRssFeedItemClassifierInput,
    resolve: (_subject, _current, query) => resolveStoryClusteringRunConfiguration(query),
    captureStoryCandidates: captureStoryClusteringCandidates,
    ready: hasCurrentStoryClusteringEmbedding,
    requestEligibility: storyClusteringRequestEligibility,
    applyEffects: applyStoryClusteringEffects,
  }
}
