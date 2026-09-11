import { SEED_PREFIX, runAndCapture, seedPostId, seedTopicId, seedUser } from '../run-support.mts'
import * as services from '../run-services.mts'
import { runPartitionPruningScenarios } from './partition-pruning.mts'

const {
  aggregateElectionVoteStatsFromReplica,
  gatherVoteWeightFactors,
  getConversationsByCreatedById,
  getCommunityModmailInbox,
  getFollowedUsersByElectionVote,
  getFriendTrustedHostnames,
  getLatestSuccessfulCrawl,
  getPlatformStats,
  getMyDirectConversations,
  getPostByAny,
  getPublicUserByAny,
  getRecommendedRssFeeds,
  getTopicByAny,
  getTopicDataPointInsights,
  getTrendingCommunities,
  getTrendingPosts,
  getTrendingRssFeeds,
  getUserBookmarkCounts,
  listUserRemovedPosts,
  POST_ELECTION_CONFIG,
  searchAdminUsers,
  searchCommunities,
  searchCommunityPosts,
  searchDataPoints,
  searchPendingPosts,
  searchTopHostnames,
  searchTopicAliases,
  searchUsers,
  TOPIC_ELECTION_CONFIG,
  updateTopicRatingStats,
} = services

export async function runEntityAndCommunityScenarios() {
  // Vote aggregation — post and topic stats (reads from post_votes / topic_votes)
  await runAndCapture('vote-aggregation-post', () =>
    aggregateElectionVoteStatsFromReplica(POST_ELECTION_CONFIG, seedPostId),
  )
  await runAndCapture('vote-aggregation-topic', () =>
    aggregateElectionVoteStatsFromReplica(TOPIC_ELECTION_CONFIG, seedTopicId),
  )

  await runPartitionPruningScenarios()

  // Crawl lookup by URL ID
  const seedCrawlUrlId = `${SEED_PREFIX}-0300-7000-8000-000000000000`
  await runAndCapture('crawl-latest-successful', () => getLatestSuccessfulCrawl(seedCrawlUrlId))

  // User lookup by username
  await runAndCapture('user-by-username', () => getPublicUserByAny('seeduser0'))

  // Post lookup by slug (hits post_slugs → view_posts)
  await runAndCapture('post-by-slug', () => getPostByAny('seed-post-0'))

  // Topic lookup by slug (hits topics + topic_aliases → view_topics)
  await runAndCapture('topic-by-slug', () => getTopicByAny('seed-topic-0'))

  // Recommended RSS feeds — multi-CTE recommendation engine with friends, topic, and collaborative sources
  await runAndCapture('recommended-rss-feeds', () =>
    getRecommendedRssFeeds(seedUser.id, { limit: 25 }),
  )

  // Vote weight factors — multi-table UNION across OAuth providers + LATERAL subqueries
  await runAndCapture('vote-weight-factors', () => gatherVoteWeightFactors(seedUser.id))

  // Follow context — which followed users voted on a post (joins votes + follows + visibility)
  await runAndCapture('follow-context-votes', () =>
    getFollowedUsersByElectionVote(seedUser, seedPostId, 'post_votes', 1),
  )

  // Trending posts — CTE with exponential time-decay scoring
  await runAndCapture('trending-posts', () => getTrendingPosts({ timeRange: 'week', limit: 25 }))

  // Trending posts filtered by topic
  await runAndCapture('trending-posts-by-topic', () =>
    getTrendingPosts({ timeRange: 'week', topicId: seedTopicId, limit: 25 }),
  )

  // Trending communities — candidates come from windowed post activity, then counts aggregate only for those
  await runAndCapture('trending-communities', () => getTrendingCommunities({ limit: 25 }))

  // Trending RSS feeds — 3 CTEs with aggregations across follows and items
  await runAndCapture('trending-rss-feeds', () =>
    getTrendingRssFeeds({ timeRange: 'week', limit: 25 }),
  )

  // Friend trusted hostnames — 3 CTEs joining follows, hostname votes, and social graph
  await runAndCapture('friend-trusted-hostnames', () =>
    getFriendTrustedHostnames(seedUser.id, { limit: 25 }),
  )

  // Community post search — JOIN with NOT EXISTS subquery for muted topics
  const seedCommunityId = `${SEED_PREFIX}-1400-7000-8000-000000000000`
  await runAndCapture('search-community-posts', () =>
    searchCommunityPosts(seedCommunityId, { limit: 25 }),
  )
  await runAndCapture('search-pending-community-posts', () =>
    searchPendingPosts(seedCommunityId, { limit: 25 }),
  )

  // Community search — JOIN with metrics view, sorted by members
  await runAndCapture(
    'search-communities',
    () => searchCommunities({ sort: 'members', limit: 25 }),
    'members',
  )
  await runAndCapture(
    'search-communities-virtual-subscriptions',
    () => searchCommunities({ sort: 'virtual_subscriptions', limit: 25 }),
    'virtual-subscriptions',
  )
  await runAndCapture(
    'search-communities-has-list-items',
    () => searchCommunities({ hasListItems: true, sort: 'virtual_subscriptions', limit: 25 }),
    'has-list-items',
  )

  // Community search — text search variant
  await runAndCapture(
    'search-communities-text',
    () => searchCommunities({ search: 'seed', sort: 'name', limit: 25 }),
    'text',
  )

  await runAndCapture(
    'search-communities-member',
    () => searchCommunities({ memberUserId: seedUser.id, sort: 'name', limit: 25 }),
    'member',
  )

  await runAndCapture('topic-data-point-insights', () => getTopicDataPointInsights(seedTopicId))

  await runAndCapture('topic-rating-stats', () => updateTopicRatingStats(seedTopicId))

  await runAndCapture('search-top-hostnames', () => searchTopHostnames({ limit: 25 }))

  // Top hostnames filtered by topic
  await runAndCapture('search-top-hostnames-by-topic', () =>
    searchTopHostnames({ topic_id: seedTopicId, limit: 25 }),
  )

  // User search — username prefix and admin UUID lookup
  await runAndCapture('search-users', () => searchUsers('seeduser', { limit: 25 }))
  await runAndCapture(
    'search-admin-users',
    () => searchAdminUsers('seeduser', { limit: 25 }),
    'prefix',
  )
  await runAndCapture(
    'search-admin-users-uuid',
    () => searchAdminUsers(seedUser.id, { limit: 25 }),
    'uuid',
  )

  // Topic alias search — autocomplete prefix query
  await runAndCapture('search-topic-aliases', () =>
    searchTopicAliases({ prefixQuery: 'seed', limit: 25 }),
  )

  // Data point search — JSONB + EXISTS subquery
  await runAndCapture('search-data-points', () =>
    searchDataPoints({ topic_id: seedTopicId, limit: 25 }),
  )

  // User bookmark counts — dynamic UNION ALL of COUNT queries across bookmark tables
  await runAndCapture('user-bookmark-counts', () => getUserBookmarkCounts(seedUser.id))

  // Conversations list by user
  await runAndCapture('conversations-by-user', () =>
    getConversationsByCreatedById(seedUser.id, { limit: 25 }),
  )
  await runAndCapture('direct-message-inbox-page', () =>
    getMyDirectConversations(seedUser.id, {
      after: {
        timestamp: '2026-01-01T00:08:20.000000Z',
        id: `${SEED_PREFIX}-0c00-7000-8000-0000000001f4`,
      },
      limit: 25,
    }),
  )
  await runAndCapture('modmail-inbox-page', () =>
    getCommunityModmailInbox(`${SEED_PREFIX}-1400-7000-8000-000000000000`, {
      after: {
        timestamp: '2026-01-01T00:08:20.000000Z',
        id: `${SEED_PREFIX}-0d00-7000-8000-0000000001f4`,
      },
      limit: 25,
    }),
  )
  await runAndCapture('user-removed-posts-page', () =>
    listUserRemovedPosts(seedUser.id, { includePlatform: true, limit: 25 }),
  )

  // Platform stats — 6 scalar COUNT subqueries
  await runAndCapture('platform-stats', () => getPlatformStats())
}
