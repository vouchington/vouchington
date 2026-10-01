import { createStoryClusteringClient, executeStoryClusteringRun } from '@agents/story-clustering'
import {
  completeStoryClusteringRun,
  createStoryClusteringRunAdapter,
  type StoryClusteringEffects,
  type StoryClusteringRunConfiguration,
} from '@services/stories'
import type { ClassifierRunRegistration } from './classifier-run-handler.mts'

/**
 * C9: the only worker code the story-clustering classifier owns. The shared classifier-run lifecycle
 * claims, caps, fails and completes the run; this hands the leased run to C9's input building and
 * runs the idempotent post-commit story refresh once the membership effects are durable.
 */
export function createStoryClusteringRegistration(): ClassifierRunRegistration<
  StoryClusteringRunConfiguration,
  never,
  StoryClusteringEffects
> {
  const adapter = createStoryClusteringRunAdapter()
  return {
    adapter,
    execute: (lease, { maxAttempts, signal }) =>
      executeStoryClusteringRun(
        { adapter, lease, maxAttempts, signal },
        {
          createClient: hooks =>
            createStoryClusteringClient({
              modelProvider: lease.resolved.configuration.modelProvider,
              beforeAttempt: hooks.beforeAttempt,
            }),
        },
      ),
    afterCompleted: completeStoryClusteringRun,
  }
}
