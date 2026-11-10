import { runStoryProjectionWorkScenarios } from './run-scenarios/story-projection-work.mts'
import { runImageQuarantineScenarios } from './run-scenarios/image-quarantine.mts'
import { runCopyrightAcceptedPageScenarios } from './run-scenarios/copyright-accepted-pages.mts'
import { runSitemapPageScenarios } from './run-scenarios/sitemap-pages.mts'
import { runBloomReconciliationScenarios } from './run-scenarios/bloom-reconciliation.mts'
import { runFollowerDistributionScenarios } from './run-scenarios/follower-distributions.mts'
import { runEntityAndCommunityScenarios } from './run-scenarios/entities-and-communities.mts'
import { runFeedAndMetricScenarios } from './run-scenarios/feed-and-metrics.mts'
import { runModerationRerunOutcomeScenarios } from './run-scenarios/moderation-rerun-outcomes.mts'
import { runHeavyFollowScenarios } from './run-scenarios/heavy-follows.mts'
import { runHotPathLoaderScenarios } from './run-scenarios/hot-path-loaders.mts'
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
import { continueAfterFailure as runStep } from './scenario-failures.mts'

export async function runEarlyScenarios(): Promise<void> {
  await runStep(runCopyrightAcceptedPageScenarios.name, runCopyrightAcceptedPageScenarios)
  await runStep(runSitemapPageScenarios.name, runSitemapPageScenarios)
  await runStep(runStoryProjectionWorkScenarios.name, runStoryProjectionWorkScenarios)
  await runStep(runImageQuarantineScenarios.name, runImageQuarantineScenarios)
  await runStep(runBloomReconciliationScenarios.name, runBloomReconciliationScenarios)
  await runStep(runMaterializedViewRefreshScenarios.name, runMaterializedViewRefreshScenarios)
  await runStep(runIngestionRawPageScenarios.name, runIngestionRawPageScenarios)
  await runStep(runHostnameBlocklistScenario.name, runHostnameBlocklistScenario)
  await runStep(runHostnameCrawlSweepScenarios.name, runHostnameCrawlSweepScenarios)
  await runStep(runCrawlerBoilerplateScenario.name, runCrawlerBoilerplateScenario)
  await runStep(runFeedAndMetricScenarios.name, runFeedAndMetricScenarios)
  await runStep(runModerationRerunOutcomeScenarios.name, runModerationRerunOutcomeScenarios)
  await runStep(runHeavyFollowScenarios.name, runHeavyFollowScenarios)
  await runStep(runPostFeedShareScenarios.name, runPostFeedShareScenarios)
  await runStep(runStoryMemberPageScenarios.name, runStoryMemberPageScenarios)
  await runStep(runStoryByIdScenario.name, runStoryByIdScenario)
  await runStep(runSearchAndFacetScenarios.name, runSearchAndFacetScenarios)
  await runStep(runSpamSignalScenarios.name, runSpamSignalScenarios)
  await runStep(runOAuthClientVerificationScenarios.name, runOAuthClientVerificationScenarios)
  await runStep(runFollowerDistributionScenarios.name, runFollowerDistributionScenarios)
  await runStep(runEntityAndCommunityScenarios.name, runEntityAndCommunityScenarios)
  await runStep(runViewDrivenReadScenarios.name, runViewDrivenReadScenarios)
  await runStep(runTopicImportAttemptScenarios.name, runTopicImportAttemptScenarios)
  await runStep(runImportRequestRetentionScenarios.name, runImportRequestRetentionScenarios)
  await runStep(runPostModerationRetentionScenarios.name, runPostModerationRetentionScenarios)
  const analyzeAgentModerationRetention = seedAndAnalyzeAgentModerationRetention
  await runStep(analyzeAgentModerationRetention.name, analyzeAgentModerationRetention)
  await runStep(runAgentModerationRetentionScenarios.name, runAgentModerationRetentionScenarios)
  await runStep(runHotPathLoaderScenarios.name, runHotPathLoaderScenarios)
  // Hidden-feed story search leaves 240 story_posts rows. Profile collection pages join
  // that table, and the generic plan sorts once those rows exist.
  await runStep(runStorySearchScenarios.name, runStorySearchScenarios)
  await runStep(runSharedLoaderScenarios.name, runSharedLoaderScenarios)
  await runStep(runMembershipWorkSelectionScenarios.name, runMembershipWorkSelectionScenarios)
  await runStep(runEngagementEmailRecipientScenarios.name, runEngagementEmailRecipientScenarios)
  await runStep(runRemoteFollowerScenarios.name, runRemoteFollowerScenarios)
  await runStep(runReviewSuccessionScenarios.name, runReviewSuccessionScenarios)
}
