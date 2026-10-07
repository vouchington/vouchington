import { SEED_PREFIX, runAndCapture, seedPostId, seedTopicId, seedUser } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import * as services from '../run-services.mts'
import { runPartitionPruningScenarios } from './partition-pruning.mts'
import { runEntityTailScenarios } from './entity-tail.mts'

const {
  aggregateElectionVoteStatsFromReplica,
  gatherVoteWeightFactors,
  getFollowedUsersByElectionVote,
  getFriendTrustedHostnames,
  getLatestSuccessfulCrawl,
  getPostByAny,
  getPublicUserByAny,
  getRecommendedRssFeeds,
  getTopicByAny,
  getTrendingCommunities,
  getTrendingPosts,
  getTrendingRssFeeds,
  POST_ELECTION_CONFIG,
  searchCommunities,
  searchCommunityPosts,
  searchPendingPosts,
  TOPIC_ELECTION_CONFIG,
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
  registerScenarioContract('crawl-latest-successful', {
    expectations: [],
    crossPartition: {
      crawls: 'Latest successful crawl by URL searches retained monthly crawl history.',
    },
  })
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
  registerScenarioContract('trending-posts', {
    expectations: [],
    crossPartition: { posts: 'Trending ranks eligible posts from the requested week.' },
  })
  await runAndCapture('trending-posts', () => getTrendingPosts({ timeRange: 'week', limit: 25 }))

  // Trending posts filtered by topic
  registerScenarioContract('trending-posts-by-topic', {
    expectations: [],
    crossPartition: { posts: 'Topic trending ranks eligible posts from the requested week.' },
  })
  await runAndCapture('trending-posts-by-topic', () =>
    getTrendingPosts({ timeRange: 'week', topicId: seedTopicId, limit: 25 }),
  )

  // Trending communities — candidates come from windowed post activity, then counts aggregate only for those
  registerScenarioContract('trending-communities', {
    expectations: [{ kind: 'custom', name: 'trendingCommunities' }],
  })
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
  registerScenarioContract('search-community-posts', {
    expectations: [],
    crossPartition: { posts: 'Community search lists posts across the community history.' },
  })
  await runAndCapture('search-community-posts', () =>
    searchCommunityPosts(seedCommunityId, { limit: 25 }),
  )
  registerScenarioContract('search-pending-community-posts', {
    expectations: [],
    crossPartition: { posts: 'Pending community search lists posts across the community history.' },
  })
  await runAndCapture('search-pending-community-posts', () =>
    searchPendingPosts(seedCommunityId, { limit: 25 }),
  )

  // Community search — JOIN with metrics view, sorted by members
  registerScenarioContract('search-communities', {
    expectations: [{ kind: 'custom', name: 'searchCommunitiesEligibility' }],
  })
  await runAndCapture(
    'search-communities',
    () => searchCommunities({ sort: 'members', limit: 25 }),
    'members',
  )
  registerScenarioContract('search-communities-virtual-subscriptions', {
    expectations: [{ kind: 'custom', name: 'searchCommunitiesEligibility' }],
  })
  await runAndCapture(
    'search-communities-virtual-subscriptions',
    () => searchCommunities({ sort: 'virtual_subscriptions', limit: 25 }),
    'virtual-subscriptions',
  )
  registerScenarioContract('search-communities-has-list-items', {
    expectations: [{ kind: 'custom', name: 'searchCommunitiesEligibility' }],
  })
  await runAndCapture(
    'search-communities-has-list-items',
    () => searchCommunities({ hasListItems: true, sort: 'virtual_subscriptions', limit: 25 }),
    'has-list-items',
  )

  // Community search — text search variant
  registerScenarioContract('search-communities-text', {
    expectations: [{ kind: 'custom', name: 'searchCommunitiesEligibility' }],
  })
  await runAndCapture(
    'search-communities-text',
    () => searchCommunities({ search: 'seed', sort: 'name', limit: 25 }),
    'text',
  )

  registerScenarioContract('search-communities-member', {
    expectations: [{ kind: 'custom', name: 'searchCommunitiesEligibility' }],
  })
  await runAndCapture(
    'search-communities-member',
    () => searchCommunities({ memberUserId: seedUser.id, sort: 'name', limit: 25 }),
    'member',
  )

  await runEntityTailScenarios()
}
