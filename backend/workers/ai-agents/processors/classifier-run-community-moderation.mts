import {
  createCommunityModerationClient,
  executeCommunityModerationRun,
} from '@agents/community-moderation'
import {
  createCommunityModerationRunAdapter,
  type CommunityModerationEffects,
  type CommunityModerationRunConfiguration,
  hasPendingCommunityModerationPage,
} from '@services/community-agent-prompts'
import { enqueueClassifierRunDispatcher } from '@queues/ai-agents/enqueues/classifier-run'
import { COMMUNITY_MODERATION_CLASSIFIER_SLUG } from '@voucha/types/entities/community-moderation-classifier'
import type { ClassifierRunRegistration } from './classifier-run-handler.mts'

/**
 * C8: the only worker code the community moderation classifier owns. The shared classifier-run
 * lifecycle claims, caps, fails and completes the run; this hands the leased run to C8's input
 * building. A completed page dispatches the next durable request after commit. An unpublish
 * publishes its change through the publication capture inside the final completion transaction.
 */
export function createCommunityModerationRegistration(): ClassifierRunRegistration<
  CommunityModerationRunConfiguration,
  never,
  CommunityModerationEffects
> {
  const adapter = createCommunityModerationRunAdapter()
  return {
    adapter,
    execute: (lease, { maxAttempts, signal }) =>
      executeCommunityModerationRun(
        { adapter, lease, maxAttempts, signal },
        {
          createClient: (hooks, current) =>
            createCommunityModerationClient({
              postId: current.subject.postId,
              communityId: current.resolved.configuration.communityId,
              selection: {
                provider: current.resolved.configuration.modelProvider,
                model: current.resolved.configuration.modelName,
              },
              classifierRunId: hooks.classifierRunId,
              beforeAttempt: hooks.beforeAttempt,
            }),
        },
      ),
    afterCompleted: async (subject, inputSha256) => {
      if (
        subject.postId === null ||
        !(await hasPendingCommunityModerationPage(subject.postId, inputSha256))
      ) {
        return
      }
      await enqueueClassifierRunDispatcher({
        classifier: COMMUNITY_MODERATION_CLASSIFIER_SLUG,
        postId: subject.postId,
        rssFeedItemId: null,
      })
    },
  }
}
