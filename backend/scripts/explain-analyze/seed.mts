import { seedFinalExplainFixtures } from './seed-data/final-fixtures.mts'
import { seedIngestionRawPages } from './seed-data/ingestion-raw-pages.mts'
import { seedRelationVoteReads } from './seed-data/relation-vote-reads.mts'
import { cleanupPublicationScopePages } from './seed-data/publication-scope-cleanup.mts'
import { cleanupNotificationVisibility } from './seed-data/notification-visibility-cleanup.mts'
import { seedBloomReconciliation } from './seed-data/bloom-reconciliation.mts'
import { seedCommunitySearchFixtures } from './seed-data/community-search-fixtures.mts'
import { seedViewPostsAndUserImportApproval } from './seed-data/user-import-approval.mts'
import { seedFollowerDistributions } from './seed-data/follower-distributions.mts'
import {
  seedAnchorPostReviewTopicRating,
  seedCrawlChunks,
  seedCrawls,
  seedHostnameVoteAggregation,
  seedPostCategoryRelationVoteDensity,
  seedPostDataPointTopics,
  seedPostReviewTopicRatings,
  seedPostSlugs,
  seedProfileLinks,
  seedRecentlyViewedPosts,
  seedRecentlyViewedTopics,
  seedRelatedUrlPostRelations,
  seedTopicAliases,
  seedVoteAggregation,
  seedVotes,
} from './seed-data/engagement.mts'
import {
  seedEntityRelations,
  seedPublisherTypeRelation,
  seedSavedPostRelations,
  seedDisabledRssFeed,
  seedFollowPostRelations,
  seedFollowRelations,
  seedFollowRssFeedRelations,
  seedFollowTopicRelations,
  seedHeavyFollowRelations,
  seedMuteBlockRelations,
  seedNotifications,
  seedConversations,
  seedConversationPaginationRows,
  seedFriendRecommendation,
  seedPrioritizedReferralPrograms,
  seedRssFeedItemCategories,
  seedStoryPostRelatedUrlProjection,
  seedUsers,
} from './seed-data/core.mts'
import { checkpointSeed, printRowCounts, runAnalyze } from './seed-data/maintenance.mts'
import { seedOAuthClientVerification } from './seed-data/oauth-client-verification.mts'
import { seedClassifierHumanVoteComparison } from './seed-data/classifier-human-vote-comparison.mts'
import { seedTopHashtags } from './seed-data/top-hashtags.mts'
import { seedViewDrivenOAuth } from './seed-data/view-driven-oauth.mts'
import { seedViewDrivenIdentity } from './seed-data/view-driven-identity.mts'
import { write } from '@data-stores/psql'
import { refreshMaterializedView } from '@data-stores/psql/migration-runner/refresh-materialized-view'
import { refreshExplainMaterializedViews } from './seed-data/materialized-view-maintenance.mts'
import { seedSharedLoaders } from './seed-data/shared-loaders.mts'
import { seedModerationReportContexts } from './seed-data/moderation-report-contexts.mts'
import { assertExplainSeedReady } from './seed-data/seed-preflight.mts'
import { seedCommentsAndDescendantDepth } from './seed-data/comment-descendant-depth.mts'
import { seedUsersDependentFixtures } from './seed-data/concurrent-lanes.mts'
async function main() {
  await assertExplainSeedReady()
  await cleanupPublicationScopePages()
  await cleanupNotificationVisibility()
  await seedUsers(20_000)
  await seedUsersDependentFixtures()
  await checkpointSeed('posts')
  await seedEntityRelations(50_000)
  await seedPublisherTypeRelation()
  await seedSavedPostRelations(5000)
  await seedFollowPostRelations(5000)
  await seedFollowRelations(10_000)
  await seedMuteBlockRelations(5000)
  await seedStoryPostRelatedUrlProjection()
  await seedDisabledRssFeed(2500)
  await seedRssFeedItemCategories(5000)
  await checkpointSeed('rss feeds')
  await seedModerationReportContexts()
  await seedFollowRssFeedRelations(2500)
  await seedFollowTopicRelations(2500)
  await seedHeavyFollowRelations()
  await seedCommentsAndDescendantDepth()
  await seedNotifications(2000)
  await seedConversations(500)
  await seedVotes(20_000, 5000)
  await seedVoteAggregation()
  await seedPostCategoryRelationVoteDensity()
  await seedHostnameVoteAggregation()
  await seedRelatedUrlPostRelations()
  await checkpointSeed('votes')
  await seedRecentlyViewedPosts(500)
  await seedRecentlyViewedTopics(500)
  await seedCrawls(500)
  await seedCrawlChunks(1500)
  await checkpointSeed('crawls')
  await seedPostSlugs(1000)
  await seedTopicAliases(2500)
  await seedSharedLoaders()
  await seedTopHashtags()
  await seedFollowerDistributions()
  await seedProfileLinks(1000)
  await seedCommunitySearchFixtures()
  await seedConversationPaginationRows(1000)
  await seedPostDataPointTopics(1000)
  await seedPostReviewTopicRatings(1000)
  await seedAnchorPostReviewTopicRating()
  await seedViewPostsAndUserImportApproval()
  await seedPrioritizedReferralPrograms()
  await seedFriendRecommendation()
  await seedIngestionRawPages()
  await seedBloomReconciliation()
  await checkpointSeed('final writes')
  await seedOAuthClientVerification()
  await seedViewDrivenOAuth()
  await seedViewDrivenIdentity()
  await seedClassifierHumanVoteComparison()
  await seedRelationVoteReads()
  await seedFinalExplainFixtures()
  await runAnalyze()
  await refreshExplainMaterializedViews(refreshMaterializedView, statement => write(statement))
  await printRowCounts()
  console.log('\nSeed complete.')
  process.exit(0)
}
main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
