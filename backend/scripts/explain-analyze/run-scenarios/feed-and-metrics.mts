import { read } from '@data-stores/psql'
import { SEED_PREFIX, runAndCapture, seedUser } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { seedUuid } from '../seed-data/common.mts'
import { getMinUUIDv7ForDate } from '@modules/utils'
import * as services from '../run-services.mts'
import { runFeedRssScenarios } from './feed-rss.mts'

const {
  getCommentAncestorsByAny,
  getConversationMessagesByConversationId,
  getElectionVotesByUser,
  getFriendRecommendations,
  getPostFeedIds,
  getPostIdsByUrlIds,
  getPostMetricsByAnyBatch,
  getPrioritizedReferralLinks,
  getTopicIds,
  getTopicMetricsByAnyBatch,
  getTopicViewerCounts,
  getTopUrlsByHostnameIds,
  getTrendingTopics,
  getUnreadNotificationsSummary,
  getUserMetricsByAnyBatch,
  listNotifications,
  POST_ELECTION_CONFIG,
  searchRssFeeds,
  searchUrlHostnames,
  TOPIC_ELECTION_CONFIG,
  aggregateCommunityActivityDigestBatch,
  listCommunityActivityDigestRecipientPage,
} = services

export async function runFeedAndMetricScenarios() {
  registerScenarioContract('post-feed', {
    expectations: [],
    crossPartition: { posts: 'The feed ranks eligible posts across the requested week.' },
  })
  await runAndCapture('post-feed', () => getPostFeedIds(seedUser, { limit: 25, time_range: '1w' }))
  await runAndCapture('trending-topics', () => getTrendingTopics({ timeRange: 'week', limit: 25 }))
  registerScenarioContract('rss-feed-search', {
    expectations: [{ kind: 'custom', name: 'rssStateProjection' }],
  })
  await runAndCapture('rss-feed-search', () => searchRssFeeds({ limit: 25 }))

  registerScenarioContract('rss-feed-search-disabled', {
    expectations: [{ kind: 'custom', name: 'rssStateProjection' }],
  })
  await runAndCapture('rss-feed-search-disabled', () =>
    searchRssFeeds({ is_enabled: false, limit: 25 }),
  )
  registerScenarioContract('rss-feed-search-all-enable-states', {
    expectations: [{ kind: 'custom', name: 'rssStateProjection' }],
  })
  await runAndCapture('rss-feed-search-all-enable-states', () =>
    searchRssFeeds({ is_enabled: null, limit: 25 }),
  )
  registerScenarioContract('rss-feed-text-search', {
    expectations: [{ kind: 'custom', name: 'rssStateProjection' }],
  })
  await runAndCapture('rss-feed-text-search', () =>
    searchRssFeeds({ text_search_query: 'seed', limit: 25 }),
  )
  await runAndCapture('friend-recommendations', () =>
    getFriendRecommendations(seedUser, { limit: 25 }),
  )

  // Comment ancestors — use a known seeded post id that exists; if not found it throws 422 which is caught above
  const seedPostId = seedUuid(0, '05')
  await runAndCapture('comment-ancestors', () => getCommentAncestorsByAny(seedPostId))
  const seedHostnameIds = [
    `${SEED_PREFIX}-0200-7000-8000-000000000000`,
    `${SEED_PREFIX}-0200-7000-8000-000000000001`,
    `${SEED_PREFIX}-0200-7000-8000-000000000002`,
  ]
  await runAndCapture('top-urls-by-hostname-ids', () => getTopUrlsByHostnameIds(seedHostnameIds))
  const seedReferralProgramId = `${SEED_PREFIX}-0900-7000-8000-000000000000`
  await runAndCapture('prioritized-referral-links', async () => {
    await getPrioritizedReferralLinks(seedUser.id, seedReferralProgramId, {
      limit: 10,
    })
  })
  const seedUrlIds = [
    `${SEED_PREFIX}-0300-7000-8000-000000000000`,
    `${SEED_PREFIX}-0300-7000-8000-000000000001`,
  ]
  registerScenarioContract('posts-by-url-ids', {
    expectations: [],
    crossPartition: { posts: 'The batch resolves posts for several requested URL ids.' },
  })
  await runAndCapture('posts-by-url-ids', () => getPostIdsByUrlIds(seedUser, seedUrlIds))
  await runFeedRssScenarios()
  await runAndCapture('notifications', () => listNotifications(seedUser.id, { limit: 25 }))
  await runAndCapture('notifications-unread-summary', () =>
    getUnreadNotificationsSummary(seedUser.id, 10),
  )
  await runAndCapture('community-activity-digest-recipients', () =>
    listCommunityActivityDigestRecipientPage(),
  )
  const digestWindowStart = new Date('2020-01-01T00:00:00.000Z')
  const digestWindowEnd = new Date('2030-01-01T00:00:00.000Z')
  await runAndCapture('community-activity-digest-aggregation', () =>
    aggregateCommunityActivityDigestBatch({
      recipientIds: [seedUser.id, `${SEED_PREFIX}-0100-7000-8000-000000000001`],
      windowStart: digestWindowStart,
      windowEnd: digestWindowEnd,
      windowStartId: getMinUUIDv7ForDate(digestWindowStart),
      windowEndId: getMinUUIDv7ForDate(digestWindowEnd),
    }),
  )
  const seedConversationId = `${SEED_PREFIX}-0b00-7000-8000-000000000000`
  registerScenarioContract('conversation-messages', {
    expectations: [{ kind: 'singleLeaf', parent: 'conversation_messages', key: 'conversation_id' }],
  })
  await runAndCapture('conversation-messages', () =>
    getConversationMessagesByConversationId(seedConversationId, { limit: 50 }),
  )
  // Posts no longer share a fixed id prefix (seed-data/common.mts spreads their timestamps), so
  // they can't be located by a LIKE pattern like topics below — compute the ids directly instead.
  const seedVotePostIds = Array.from({ length: 100 }, (_, index) => seedUuid(index, '05'))
  await runAndCapture('post-votes-by-user', () =>
    getElectionVotesByUser(POST_ELECTION_CONFIG, seedUser.id, seedVotePostIds),
  )
  const seedAllTopicIds = (
    await read<{ id: string }>(
      `/* explainAnalyzeRun */ SELECT id FROM topics WHERE id::text LIKE $1 ORDER BY id LIMIT 100`,
      [`${SEED_PREFIX}-04%`],
    )
  ).rows.map(r => r.id)
  await runAndCapture('topic-votes-by-user', () =>
    getElectionVotesByUser(TOPIC_ELECTION_CONFIG, seedUser.id, seedAllTopicIds),
  )
  const seedUserIds = [
    `${SEED_PREFIX}-0100-7000-8000-000000000000`,
    `${SEED_PREFIX}-0100-7000-8000-000000000001`,
    `${SEED_PREFIX}-0100-7000-8000-000000000002`,
    `${SEED_PREFIX}-0100-7000-8000-000000000003`,
    `${SEED_PREFIX}-0100-7000-8000-000000000004`,
  ]
  await runAndCapture('user-metrics-batch', () => getUserMetricsByAnyBatch(seedUserIds))
  registerScenarioContract('topic-metrics-batch', {
    expectations: [
      { kind: 'queryBinds', token: 'requested_topic_ids' },
      { kind: 'forbidCorrelatedAggregates' },
      ...Object.entries({
        posts: 5_000,
        relation__post__category__topic: 5_000,
        relation__post__category__topic_alias: 5_000,
        post_review_topic_ratings: 5_000,
        post_data_point_topics: 5_000,
        rss_feed_item_categories: 6_000,
        rss_feed_item_sources: 20_000,
        rss_feed_items: 10_000,
        rss_feeds: 6_000,
      }).map(([relation, max]) => ({ kind: 'maxProcessedRows' as const, relation, max })),
    ],
    crossPartition: {
      posts: 'Topic metrics aggregate posts for 100 requested topics across their id ranges.',
      relation__post__category__topic: 'Topic metrics aggregate category relations across posts.',
      post_review_topic_ratings: 'Topic metrics aggregate ratings across posts.',
      post_data_point_topics: 'Topic metrics aggregate data points across posts.',
      rss_feed_items: 'Topic metrics aggregate matching RSS items across the seed window.',
    },
  })
  await runAndCapture('topic-metrics-batch', () => getTopicMetricsByAnyBatch(seedAllTopicIds))
  const seedPostIds = Array.from({ length: 200 }, (_, index) => seedUuid(index, '05'))
  registerScenarioContract('post-metrics-batch', {
    expectations: [
      { kind: 'queryBinds', token: 'requested_posts' },
      { kind: 'forbidCorrelatedAggregates' },
      { kind: 'maxProcessedRows', relation: 'posts', max: 10_000 },
      { kind: 'maxProcessedRows', relation: 'relation__user__follow__post', max: 1_000 },
      { kind: 'maxProcessedRows', relation: 'relation__user__save__post', max: 1_000 },
    ],
    crossPartition: { posts: 'The batch requests 200 post ids spanning seeded id ranges.' },
  })
  await runAndCapture('post-metrics-batch', () => getPostMetricsByAnyBatch(seedPostIds))
  const seedTopicId = `${SEED_PREFIX}-0400-7000-8000-000000000000`
  await runAndCapture('url-hostname-search-by-topic', () =>
    searchUrlHostnames({ topic_ids: [seedTopicId], limit: 25 }),
  )
  registerScenarioContract('topic-viewer-counts', {
    expectations: [{ kind: 'custom', name: 'topicViewerCandidateBind' }],
    crossPartition: {
      relation__post__category__topic:
        'Topic viewer counts follow candidate topic relations across posts.',
    },
  })
  await runAndCapture('topic-viewer-counts', () => getTopicViewerCounts(seedUser, seedTopicId))
  await runAndCapture('topic-search-text', () =>
    getTopicIds({ text_search_query: 'seed', limit: 25 }),
  )
  await runAndCapture('topic-search-best', () => getTopicIds({ sort: 'best', limit: 25 }))
}
