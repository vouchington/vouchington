import { read } from '@data-stores/psql'
import { SEED_PREFIX, runAndCapture, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { STORY_POST_RELATED_URL_PROJECTION_SEED } from '../seed-data/story-post-related-url-projection.mts'
import * as services from '../run-services.mts'

const {
  getCommentAncestorsByAny,
  getConversationMessagesByConversationId,
  getElectionVotesByUser,
  getFriendRecommendations,
  getPostFeedIds,
  getPostIds,
  getPostIdsByUrlIds,
  getPostMetricsByAnyBatch,
  getPrioritizedReferralLinks,
  getRssFeedItemFeedIds,
  getTopicIds,
  getTopicMetricsByAnyBatch,
  getTopicViewerCounts,
  getTopUrlsByHostnameIds,
  getTrendingTopics,
  getUnreadNotificationsSummary,
  getStoryPostRelatedUrlProjectionSourcePage,
  getUserMetricsByAnyBatch,
  listNotifications,
  POST_ELECTION_CONFIG,
  searchRssFeedItems,
  searchRssFeeds,
  searchUrlHostnames,
  TOPIC_ELECTION_CONFIG,
  aggregateCommunityActivityDigestBatch,
  listCommunityActivityDigestRecipientPage,
} = services

export async function runFeedAndMetricScenarios() {
  await runAndCapture('post-feed', () =>
    getPostFeedIds(seedUser as any, { limit: 25, time_range: '1w' }),
  )
  await runAndCapture('trending-topics', () => getTrendingTopics({ timeRange: 'week', limit: 25 }))
  await runAndCapture('rss-feed-search', () => searchRssFeeds({ limit: 25 }))

  await runAndCapture('rss-feed-search-disabled', () =>
    searchRssFeeds({ enabled: false, limit: 25 }),
  )
  await runAndCapture('rss-feed-search-all-enable-states', () =>
    searchRssFeeds({ enabled: null, limit: 25 }),
  )
  await runAndCapture('rss-feed-text-search', () =>
    searchRssFeeds({ text_search_query: 'seed', limit: 25 }),
  )
  await runAndCapture('friend-recommendations', () =>
    getFriendRecommendations(seedUser as any, { limit: 25 }),
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
  await runAndCapture('posts-by-url-ids', () => getPostIdsByUrlIds(seedUser as any, seedUrlIds))
  await runAndCapture('rss-feed-item-feed', () =>
    getRssFeedItemFeedIds(seedUser as any, { limit: 25, time_range: '1w' }),
  )
  await runAndCapture('rss-feed-item-feed-follow-rss-feeds', () =>
    getRssFeedItemFeedIds(seedUser as any, {
      limit: 25,
      time_range: '1w',
      feed_type: 'follow_rss_feeds',
    }),
  )
  await runAndCapture('rss-feed-item-feed-follow-topics', () =>
    getRssFeedItemFeedIds(seedUser as any, {
      limit: 25,
      time_range: '1w',
      feed_type: 'follow_topics',
    }),
  )
  await runAndCapture('rss-feed-items-search', () => searchRssFeedItems({ limit: 25 }))
  const seedTopicIds = [`${SEED_PREFIX}-0400-7000-8000-000000000000`]
  await runAndCapture('rss-feed-items-search-by-topic', () =>
    searchRssFeedItems({ topic_ids: seedTopicIds, limit: 25 }),
  )
  await runAndCapture('post-search-new', () =>
    getPostIds(seedUser as any, { limit: 25, time_range: '1w' }),
  )
  await runAndCapture('post-search-best', () =>
    getPostIds(seedUser as any, { sort: 'best', limit: 25, time_range: '1w' }),
  )
  await runAndCapture('post-search-hot', () =>
    getPostIds(seedUser as any, { sort: 'hot', limit: 25, time_range: '1w' }),
  )
  await runAndCapture('rss-feed-item-feed-related-posts', () =>
    getRssFeedItemFeedIds(seedUser as any, {
      limit: 25,
      time_range: '1w',
      has_related_posts: true,
    }),
  )
  await runAndCapture('story-post-related-url-projection-source-page', () =>
    getStoryPostRelatedUrlProjectionSourcePage({
      storyId: STORY_POST_RELATED_URL_PROJECTION_SEED.storyId,
      sourceCursorId: null,
      sourceHighWaterId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      limit: 100,
    }),
  )
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
  await runAndCapture('topic-metrics-batch', () => getTopicMetricsByAnyBatch(seedAllTopicIds))
  const seedPostIds = Array.from({ length: 200 }, (_, index) => seedUuid(index, '05'))
  await runAndCapture('post-metrics-batch', () => getPostMetricsByAnyBatch(seedPostIds))
  const seedTopicId = `${SEED_PREFIX}-0400-7000-8000-000000000000`
  await runAndCapture('url-hostname-search-by-topic', () =>
    searchUrlHostnames({ topic_ids: [seedTopicId], limit: 25 }),
  )
  await runAndCapture('topic-viewer-counts', () =>
    getTopicViewerCounts(seedUser as any, seedTopicId),
  )
  await runAndCapture('topic-search-text', () =>
    getTopicIds({ text_search_query: 'seed', limit: 25 }),
  )
  await runAndCapture('topic-search-best', () => getTopicIds({ sort: 'best', limit: 25 }))
}
