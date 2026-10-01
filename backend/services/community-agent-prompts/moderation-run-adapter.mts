import type { ClassifierRunAdapter } from '@services/classifier-runs'
import {
  communityModerationRequestEligibility,
  lockCommunityModerationInput,
} from '@services/communities/publications/moderation-run'
import { COMMUNITY_MODERATION_CLASSIFIER_SLUG } from '@voucha/types/entities/community-moderation-classifier'
import {
  resolveCommunityModerationRunConfiguration,
  type CommunityModerationRunConfiguration,
} from './moderation-run-configuration.mts'
import {
  applyCommunityModerationEffects,
  type CommunityModerationEffects,
} from './moderation-run-effects.mts'

export type CommunityModerationRunAdapter = ClassifierRunAdapter<
  CommunityModerationRunConfiguration,
  never,
  CommunityModerationEffects
>

/**
 * The C8 adapter: a post still published in its community is classified once per content digest
 * and configuration against every one of the community's active prompts in a single provider
 * call, and the durable decision becomes the per-prompt projection and the community's action.
 * The shared classifier-run lifecycle owns receipt, lease, attempts, completion, supersession and
 * sweep.
 */
export function createCommunityModerationRunAdapter(): CommunityModerationRunAdapter {
  return {
    slug: COMMUNITY_MODERATION_CLASSIFIER_SLUG,
    lockCurrent: lockCommunityModerationInput,
    resolve: (_subject, current, query) =>
      current.communityId === null
        ? Promise.resolve(null)
        : resolveCommunityModerationRunConfiguration(current.communityId, query),
    requestEligibility: communityModerationRequestEligibility,
    applyEffects: applyCommunityModerationEffects,
  }
}
