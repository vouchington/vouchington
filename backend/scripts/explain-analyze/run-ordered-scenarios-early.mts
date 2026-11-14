import { runStoryProjectionWorkScenarios } from './run-scenarios/story-projection-work.mts'
import { runImageQuarantineScenarios } from './run-scenarios/image-quarantine.mts'
import { runCopyrightAcceptedPageScenarios } from './run-scenarios/copyright-accepted-pages.mts'
import { runSitemapPageScenarios } from './run-scenarios/sitemap-pages.mts'
import { runBloomReconciliationScenarios } from './run-scenarios/bloom-reconciliation.mts'
import { runFollowerDistributionScenarios } from './run-scenarios/follower-distributions.mts'
import { runEntityAndCommunityScenarios } from './run-scenarios/entities-and-communities.mts'
import { runQueryShapeNoOpScenarios } from './run-scenarios/query-shape-no-ops.mts'
import { runFeedAndMetricScenarios } from './run-scenarios/feed-and-metrics.mts'
import { runModerationRerunOutcomeScenarios } from './run-scenarios/moderation-rerun-outcomes.mts'
import { runHeavyFollowScenarios } from './run-scenarios/heavy-follows.mts'
import { runHotPathLoaderScenarios } from './run-scenarios/hot-path-loaders.mts'
import { runPublicRssPostSnapshotScenarios } from './run-scenarios/public-rss-post-snapshots.mts'
import { runStorySearchScenarios } from './run-scenarios/story-search.mts'
import { runMembershipWorkSelectionScenarios } from './run-scenarios/membership-work-selection.mts'
import { runEngagementEmailRecipientScenarios } from './run-scenarios/engagement-email-recipients.mts'
import { runRemoteFollowerScenarios } from './run-scenarios/remote-followers.mts'
import { runReviewSuccessionScenarios } from './run-scenarios/review-successions.mts'
import { runTopicImportAttemptScenarios } from './run-scenarios/topic-import-attempts.mts'
import { runImportRequestRetentionScenarios } from './run-scenarios/import-request-retention.mts'
import { runSearchAndFacetScenarios } from './run-scenarios/search-and-facets.mts'
import { runOAuthClientVerificationScenarios } from './run-scenarios/oauth-client-verification.mts'
import { runPostFeedShareScenarios } from './run-scenarios/post-feed-shares.mts'
import { runStoryMemberPageScenarios } from './run-scenarios/story-member-pages.mts'
import { runStoryByIdScenario } from './run-scenarios/story-by-id.mts'
import { runHostnameCrawlSweepScenarios } from './run-scenarios/hostname-crawl-sweeps.mts'
import { runCrawlerBoilerplateScenario } from './run-scenarios/crawler-boilerplate.mts'
import { runHostnameBlocklistScenario } from './run-scenarios/hostname-blocklist.mts'
import { runMaterializedViewRefreshScenarios } from './run-scenarios/materialized-view-refreshes.mts'
import { runIngestionRawPageScenarios } from './run-scenarios/ingestion-raw-pages.mts'
import { runViewDrivenReadScenarios } from './run-scenarios/view-driven-reads.mts'
import { seedAndAnalyzeAgentModerationRetention } from './seed-data/agent-moderation-retention.mts'
import { runSharedLoaderScenarios } from './run-scenarios/shared-loaders.mts'
import { runPostModerationRetentionScenarios } from './run-scenarios/post-moderation-retention.mts'
import { runSpamSignalScenarios } from './run-scenarios/spam-signals.mts'
import { runAgentModerationRetentionScenarios } from './run-scenarios/agent-moderation-retention.mts'

export const EARLY_RUNNERS: readonly (() => Promise<unknown>)[] = [
  runCopyrightAcceptedPageScenarios,
  runSitemapPageScenarios,
  runStoryProjectionWorkScenarios,
  runImageQuarantineScenarios,
  runBloomReconciliationScenarios,
  runMaterializedViewRefreshScenarios,
  runIngestionRawPageScenarios,
  runHostnameBlocklistScenario,
  runHostnameCrawlSweepScenarios,
  runCrawlerBoilerplateScenario,
  runFeedAndMetricScenarios,
  runModerationRerunOutcomeScenarios,
  runHeavyFollowScenarios,
  runPostFeedShareScenarios,
  runStoryMemberPageScenarios,
  runStoryByIdScenario,
  runSearchAndFacetScenarios,
  runSpamSignalScenarios,
  runOAuthClientVerificationScenarios,
  runFollowerDistributionScenarios,
  runEntityAndCommunityScenarios,
  runQueryShapeNoOpScenarios,
  runViewDrivenReadScenarios,
  runTopicImportAttemptScenarios,
  runImportRequestRetentionScenarios,
  runPostModerationRetentionScenarios,
  seedAndAnalyzeAgentModerationRetention,
  runAgentModerationRetentionScenarios,
  runHotPathLoaderScenarios,
  runPublicRssPostSnapshotScenarios,
  // Hidden-feed story search leaves 240 story_posts rows. Profile collection pages join
  // that table, and the generic plan sorts once those rows exist.
  runStorySearchScenarios,
  runSharedLoaderScenarios,
  runMembershipWorkSelectionScenarios,
  runEngagementEmailRecipientScenarios,
  runRemoteFollowerScenarios,
  runReviewSuccessionScenarios,
]
