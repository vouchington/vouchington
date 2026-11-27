import { runNotificationVisibilityScenarios } from './run-scenarios/notification-visibility.mts'
import { runPublicationScopePageScenarios } from './run-scenarios/publication-scope-pages.mts'
import { runDenseTopicViewerCountsScenario } from './run-scenarios/topic-viewer-counts-dense.mts'
import { runManyAliasTopicViewerCountsScenario } from './run-scenarios/topic-viewer-counts-many-aliases.mts'
import { runLargeTopicRatingStatsScenario } from './run-scenarios/topic-rating-stats-large.mts'
import { runTopicAliasCategoryWorkScenarios } from './run-scenarios/topic-alias-category-work.mts'
import { runTopicTextCategoryPageScenarios } from './run-scenarios/topic-text-category-pages.mts'
import { runHackerNewsFilterScenarios } from './run-scenarios/hacker-news-filter.mts'
import { RETENTION_RECOVERY_RUNNERS } from './run-ordered-scenarios-retention-recovery.mts'
import { runHackerNewsCardSidecarScenarios } from './run-scenarios/hacker-news-card-sidecars.mts'

export const PUBLICATION_TOPICS_RUNNERS: readonly (() => Promise<unknown>)[] = [
  // Hot publication fixtures live only after all ordinary corpus plans and clean up on failure.
  runNotificationVisibilityScenarios,
  runPublicationScopePageScenarios,
  runDenseTopicViewerCountsScenario,
  runManyAliasTopicViewerCountsScenario,
  runLargeTopicRatingStatsScenario,
  runTopicAliasCategoryWorkScenarios,
  runTopicTextCategoryPageScenarios,
  runHackerNewsFilterScenarios,
  ...RETENTION_RECOVERY_RUNNERS,
  runHackerNewsCardSidecarScenarios,
]
