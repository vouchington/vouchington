import {
  seedAnchorPostReviewTopicRating,
  seedComments,
  seedCommunities,
  seedCommunityListItemTopic,
  seedCommunityPosts,
  seedCommunityProxyFollowsAndMutes,
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
  seedTrendingCommunityPostIds,
  seedVoteAggregation,
  seedVotes,
} from './seed-data/engagement.mts'
import {
  INDIVIDUAL_CARD_SEED_COUNT,
  POINT_VALUATION_SEED_COUNT,
  SPENDING_CATEGORY_SEED_COUNT,
  seedEntityRelations,
  seedPublisherTypeRelation,
  seedSavedPostRelations,
  seedIndividualCards,
  seedPointValuations,
  seedSpendingCategories,
  seedRewardsProgramStatuses,
  REWARDS_PROGRAM_STATUS_SEED_COUNT,
  seedDisabledRssFeed,
  seedFollowPostRelations,
  seedFollowRelations,
  seedFollowRssFeedRelations,
  seedFollowTopicRelations,
  seedHeavyFollowRelations,
  seedHostnames,
  seedMuteBlockRelations,
  seedNotifications,
  seedPosts,
  seedRemoteFollowers,
  seedUserRemovedPlatformPosts,
  seedConversations,
  seedConversationPaginationRows,
  seedFriendRecommendation,
  seedPrioritizedReferralLink,
  seedRssFeedItemCategories,
  seedRssFeeds,
  seedSemanticRssFeedItems,
  seedStoryPostRelatedUrlProjection,
  seedTopicParentRelations,
  seedTopics,
  seedUrls,
  seedCommittedPostAdmissionReservations,
  seedTopicImportAttempts,
  seedUsers,
} from './seed-data/core.mts'
import { checkpointSeed, printRowCounts, runAnalyze } from './seed-data/maintenance.mts'
import {
  seedMembershipRefunds,
  seedMemberships,
  seedMembershipProducts,
} from './seed-data/memberships.mts'

async function main() {
  await seedUsers(20_000)
  await seedTopicImportAttempts()
  await seedMembershipProducts()
  await seedMemberships()
  await seedMembershipRefunds()
  await checkpointSeed('memberships')
  await seedHostnames()
  await seedRemoteFollowers()
  await seedUrls()
  await seedTopics(2500)
  await seedIndividualCards(INDIVIDUAL_CARD_SEED_COUNT)
  await seedPointValuations(POINT_VALUATION_SEED_COUNT)
  await seedSpendingCategories(SPENDING_CATEGORY_SEED_COUNT)
  await seedRewardsProgramStatuses(REWARDS_PROGRAM_STATUS_SEED_COUNT)
  await seedTopicParentRelations(500)
  await seedPosts(100_000)
  await seedCommittedPostAdmissionReservations()
  await seedUserRemovedPlatformPosts()
  await checkpointSeed('posts')
  await seedEntityRelations(50_000)
  await seedPublisherTypeRelation()
  await seedSavedPostRelations(5000)
  await seedFollowPostRelations(5000)
  await seedFollowRelations(10_000)
  await seedMuteBlockRelations(5000)
  await seedRssFeeds(2500, 25_000)
  await seedSemanticRssFeedItems()
  await seedStoryPostRelatedUrlProjection()
  await seedDisabledRssFeed(2500)
  await seedRssFeedItemCategories(5000)
  await checkpointSeed('rss feeds')
  await seedFollowRssFeedRelations(2500)
  await seedFollowTopicRelations(2500)
  await seedHeavyFollowRelations()
  await seedComments()
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
  await seedProfileLinks(1000)
  await seedCommunities(5, 200)
  await seedCommunityListItemTopic()
  await seedCommunityPosts()
  await seedTrendingCommunityPostIds()
  await seedCommunityProxyFollowsAndMutes()
  await seedConversationPaginationRows(1000)
  await seedPostDataPointTopics(1000)
  await seedPostReviewTopicRatings(1000)
  await seedAnchorPostReviewTopicRating()
  await seedPrioritizedReferralLink()
  await seedFriendRecommendation()
  await checkpointSeed('final writes')
  await runAnalyze()
  await printRowCounts()
  console.log('\nSeed complete.')
  process.exit(0)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
