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
import {
  communityModerationRequestReady,
  replayCompletedCommunityModerationPage,
} from './moderation-run-progress.mts'

export type CommunityModerationRunAdapter = ClassifierRunAdapter<
  CommunityModerationRunConfiguration,
  never,
  CommunityModerationEffects
>

/**
 * The C8 adapter: a post still published in its community is classified once per content digest
 * and configuration against a bounded activation-order page of community prompts. The durable
 * request resumes at the next page; only the final page applies the accumulated community action.
 * The shared classifier-run lifecycle owns receipt, lease, attempts, completion, supersession and
 * sweep.
 */
export function createCommunityModerationRunAdapter(): CommunityModerationRunAdapter {
  return {
    slug: COMMUNITY_MODERATION_CLASSIFIER_SLUG,
    lockCurrent: lockCommunityModerationInput,
    ready: (query, subject, current) =>
      subject.postId === null
        ? Promise.resolve(false)
        : communityModerationRequestReady(query, subject.postId, current.inputSha256),
    resolve: (subject, current, query) =>
      current.communityId === null || subject.postId === null
        ? Promise.resolve(null)
        : resolveCommunityModerationRunConfiguration(current.communityId, query, {
            postId: subject.postId,
            inputSha256: current.inputSha256,
          }),
    requestEligibility: communityModerationRequestEligibility,
    replayCompleted: async (query, input) => {
      if (input.subject.postId === null) {
        throw new Error('community moderation replay subject must be a post')
      }
      await replayCompletedCommunityModerationPage(query, {
        runId: input.runId,
        postId: input.subject.postId,
        inputSha256: input.inputSha256,
        nextCursor: input.resolved.configuration.nextCursor,
        decisionBatchId: input.decisionBatchId,
      })
    },
    applyEffects: applyCommunityModerationEffects,
  }
}
