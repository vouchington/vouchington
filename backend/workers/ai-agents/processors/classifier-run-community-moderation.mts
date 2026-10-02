import {
  createCommunityModerationClient,
  executeCommunityModerationRun,
} from '@agents/community-moderation'
import {
  createCommunityModerationRunAdapter,
  type CommunityModerationEffects,
  type CommunityModerationRunConfiguration,
} from '@services/community-agent-prompts'
import type { ClassifierRunRegistration } from './classifier-run-handler.mts'

/**
 * C8: the only worker code the community moderation classifier owns. The shared classifier-run
 * lifecycle claims, caps, fails and completes the run; this hands the leased run to C8's input
 * building. There is no post-commit work: an unpublish publishes its change through the
 * publication capture inside the completion transaction.
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
              modelProvider: current.resolved.configuration.modelProvider,
              classifierRunId: hooks.classifierRunId,
              beforeAttempt: hooks.beforeAttempt,
            }),
        },
      ),
  }
}
