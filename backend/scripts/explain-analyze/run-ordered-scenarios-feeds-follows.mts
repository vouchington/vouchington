import { runFeedAndMetricScenarios } from './run-scenarios/feed-and-metrics.mts'
import { runModerationRerunOutcomeScenarios } from './run-scenarios/moderation-rerun-outcomes.mts'
import { runHeavyFollowScenarios } from './run-scenarios/heavy-follows.mts'
import { runPostFeedShareScenarios } from './run-scenarios/post-feed-shares.mts'
import { runStoryMemberPageScenarios } from './run-scenarios/story-member-pages.mts'
import { runStoryByIdScenario } from './run-scenarios/story-by-id.mts'
import { runUsersByReferenceBatchScenario } from './run-scenarios/users-by-reference-batch.mts'

export const FEEDS_FOLLOWS_RUNNERS: readonly (() => Promise<unknown>)[] = [
  runFeedAndMetricScenarios,
  runModerationRerunOutcomeScenarios,
  runHeavyFollowScenarios,
  runPostFeedShareScenarios,
  runStoryMemberPageScenarios,
  runStoryByIdScenario,
  runUsersByReferenceBatchScenario,
]
