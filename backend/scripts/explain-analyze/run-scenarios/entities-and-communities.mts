import { runCrawlerRefreshScenario } from './crawler-refresh.mts'
import { runRelationVoteReadScenarios } from './relation-vote-reads.mts'
import { runCommunitySearchScenarios } from './community-search.mts'
import { SEED_PREFIX, runAndCapture, seedPostId, seedTopicId, seedUser } from '../run-support.mts'
import {
  cleanupRecommendedRssFeedsPopularFeed,
  seedRecommendedRssFeedsPopularFeed,
} from '../seed-data/recommended-rss-feeds.mts'
import { FRIEND_TRUST_VIEWER_INDEX } from '../seed-data/friend-trusted-hostnames.mts'
import { seedUuid } from '../seed-data/common.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { getViewPostsHydrationContract } from '../view-posts-hydration-contract.mts'
import {
  aggregateElectionVoteStatsFromReplica,
  gatherVoteWeightFactors,
  getFollowedUsersByElectionVote,
  getFriendTrustedHostnames,
  getLatestSuccessfulCrawl,
  getPostByAny,
  getPublicUserByAny,
  getRecommendedRssFeeds,
  getTopicByAny,
  getPostIds,
  searchCommunities,
  searchRssFeeds,
  POST_ELECTION_CONFIG,
  TOPIC_ELECTION_CONFIG,
} from '../run-services.mts'
import { runPartitionPruningScenarios } from './partition-pruning.mts'
import { runEntityTailScenarios } from './entity-tail.mts'
import { runViewDrivenPostScenarios } from './view-driven-posts.mts'

export async function runEntityAndCommunityScenarios() {
  // Vote aggregation — post and topic stats (reads from post_votes / topic_votes)
  await runAndCapture('vote-aggregation-post', () =>
    aggregateElectionVoteStatsFromReplica(POST_ELECTION_CONFIG, seedPostId),
  )
  await runAndCapture('vote-aggregation-topic', () =>
    aggregateElectionVoteStatsFromReplica(TOPIC_ELECTION_CONFIG, seedTopicId),
  )

  await runPartitionPruningScenarios()
  await runRelationVoteReadScenarios()

  await runCrawlerRefreshScenario()

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
  registerScenarioContract('post-by-slug', await getViewPostsHydrationContract('post-by-slug'))
  await runAndCapture('post-by-slug', () => getPostByAny('seed-post-3'))

  // Topic lookup by slug (hits topics + topic_aliases → view_topics)
  await runAndCapture('topic-by-slug', () => getTopicByAny('seed-topic-0'))

  // Recommended RSS feeds — multi-CTE recommendation engine with friends, topic, and collaborative sources.
  // The viewer follows a popular feed (1,000 co-followers with 30 follows each) plus 30 more feeds;
  // the collaborative arm reads the viewer's newest 10 follows x each feed's newest 25 co-followers
  // x each co-follower's newest 20 follows (at most 5,000 follows) through the newest-follow indexes.
  // The 5,600 ceiling adds the viewer's own follows and the friends arm (seeduser1's 200 follows).
  registerScenarioContract('recommended-rss-feeds', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'relation__user__follow__rss_feed', max: 5_600 },
      {
        kind: 'usesIndexes',
        indexes: [
          'idx_relation__user__follow__rss_feed__subject__newest',
          'idx_relation__user__follow__rss_feed__object__newest',
        ],
      },
    ],
  })
  await seedRecommendedRssFeedsPopularFeed()
  try {
    await runAndCapture('recommended-rss-feeds', () =>
      getRecommendedRssFeeds(seedUser.id, { limit: 25 }),
    )
  } finally {
    await cleanupRecommendedRssFeedsPopularFeed()
  }

  // Vote weight factors — multi-table UNION across OAuth providers + LATERAL subqueries
  await runAndCapture('vote-weight-factors', () => gatherVoteWeightFactors(seedUser.id))

  // Follow context — which followed users voted on a post (joins votes + follows + visibility)
  await runAndCapture('follow-context-votes', () =>
    getFollowedUsersByElectionVote(seedUser, seedPostId, 'post_votes', 1),
  )

  // Trending posts share the posts search walk for the week the product page requests.
  registerScenarioContract('trending-posts', {
    expectations: [],
    crossPartition: { posts: 'Trending ranks eligible posts from the requested week.' },
  })
  await runAndCapture('trending-posts', () =>
    getPostIds(undefined, { sort: 'trending', time_range: '1w', limit: 25 }),
  )

  registerScenarioContract('trending-posts-by-topic', {
    expectations: [],
    crossPartition: { posts: 'Topic trending ranks eligible posts from the requested week.' },
  })
  await runAndCapture('trending-posts-by-topic', () =>
    getPostIds(undefined, {
      sort: 'trending',
      time_range: '1w',
      trending_topic_id: seedTopicId,
      limit: 25,
    }),
  )

  // Trending communities — one keyset page over the materialized score
  registerScenarioContract('search-communities-trending', {
    // The ranked fixture includes matching and unrelated communities; the page bound is unchanged.
    expectations: [{ kind: 'maxProcessedRows', relation: 'mv_trending_communities', max: 26 }],
  })
  await runAndCapture('search-communities-trending', () =>
    searchCommunities({ sort: 'trending', limit: 25 }),
  )

  // Trending RSS feeds — 3 CTEs with aggregations across follows and items
  registerScenarioContract('search-rss-feeds-trending', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_mv_trending_rss_feeds__ranking'] },
      { kind: 'maxProcessedRows', relation: 'mv_trending_rss_feeds', max: 26 },
    ],
  })
  await runAndCapture('search-rss-feeds-trending', () =>
    searchRssFeeds({ sort: 'trending', time_range: 'week', limit: 25 }),
  )

  // Friend trusted hostnames — a viewer following 2k users reads only the newest 1,000 follows x
  // 20 ballots each (the DynamicConfig defaults), never every ballot a friend has cast.
  registerScenarioContract('friend-trusted-hostnames', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_relation__user__follow__user__subject__newest'],
      },
      { kind: 'usesIndexes', indexes: ['hostname_votes__default_user_id_id_idx'] },
      { kind: 'maxProcessedRows', relation: 'relation__user__follow__user', max: 1_100 },
      { kind: 'maxProcessedRows', relation: 'hostname_votes', max: 20_000 },
    ],
  })
  await runAndCapture('friend-trusted-hostnames', () =>
    getFriendTrustedHostnames(seedUuid(FRIEND_TRUST_VIEWER_INDEX, '01'), { limit: 25 }),
  )

  await runViewDrivenPostScenarios()
  await runCommunitySearchScenarios()
  await runEntityTailScenarios()
}
