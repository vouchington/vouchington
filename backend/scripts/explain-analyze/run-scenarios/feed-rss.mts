import { SEED_PREFIX, runAndCapture, seedUser } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import {
  HOSTNAME_COUNT,
  RSS_FEED_ITEM_SEED_COUNT,
  RSS_FEED_SEED_COUNT,
  seedUuid,
} from '../seed-data/common.mts'
import { STORY_POST_RELATED_URL_PROJECTION_SEED } from '../seed-data/story-post-related-url-projection.mts'
import { runRssFeedFirstAndContinuationScenarios } from './rss-feed-pages.mts'
import * as services from '../run-services.mts'

const {
  getPostIds,
  getRssFeedItemFeedIds,
  getStoryPostRelatedUrlProjectionSourcePage,
  searchRssFeedItems,
} = services

export async function runFeedRssScenarios(): Promise<void> {
  await runRssFeedFirstAndContinuationScenarios('rss-feed-item-feed', seedUser, {
    limit: 25,
    time_range: '1w',
  })
  registerScenarioContract('rss-feed-item-feed-follow-rss-feeds', {
    expectations: [
      { kind: 'custom', name: 'rssFeedCandidates' },
      {
        kind: 'maxProcessedRows',
        relation: 'rss_feed_item_sources',
        max: RSS_FEED_ITEM_SEED_COUNT * Math.ceil(RSS_FEED_SEED_COUNT / HOSTNAME_COUNT) * 3,
      },
      { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: RSS_FEED_ITEM_SEED_COUNT * 2 },
    ],
    crossPartition: {
      rss_feed_items: 'The feed ranks recent matching items across the time window.',
    },
  })
  await runAndCapture('rss-feed-item-feed-follow-rss-feeds', () =>
    getRssFeedItemFeedIds(seedUser, {
      limit: 25,
      time_range: '1w',
      feed_type: 'follow_rss_feeds',
    }),
  )
  registerScenarioContract('rss-feed-item-feed-follow-topics', {
    expectations: [
      { kind: 'custom', name: 'rssFeedCandidates' },
      {
        kind: 'maxProcessedRows',
        relation: 'rss_feed_item_sources',
        max: RSS_FEED_ITEM_SEED_COUNT * Math.ceil(RSS_FEED_SEED_COUNT / HOSTNAME_COUNT) * 3,
      },
      { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: RSS_FEED_ITEM_SEED_COUNT * 2 },
    ],
    crossPartition: {
      rss_feed_items: 'The feed ranks recent matching items across the time window.',
    },
  })
  await runAndCapture('rss-feed-item-feed-follow-topics', () =>
    getRssFeedItemFeedIds(seedUser, {
      limit: 25,
      time_range: '1w',
      feed_type: 'follow_topics',
    }),
  )
  await runRssFeedFirstAndContinuationScenarios(
    'rss-feed-item-feed-sparse-source-filter',
    seedUser,
    {
      limit: 25,
      time_range: '1w',
      topic_ids: [seedUuid(0, '04')],
    },
  )
  registerScenarioContract('rss-feed-items-search', {
    expectations: [],
    crossPartition: {
      rss_feed_items: 'Global RSS search ranks eligible items across the requested window.',
    },
  })
  await runAndCapture('rss-feed-items-search', () => searchRssFeedItems({ limit: 25 }))
  const seedTopicIds = [`${SEED_PREFIX}-0400-7000-8000-000000000000`]
  registerScenarioContract('rss-feed-items-search-by-topic', {
    expectations: [],
    crossPartition: {
      rss_feed_items: 'Topic RSS search ranks eligible items across the requested window.',
    },
  })
  await runAndCapture('rss-feed-items-search-by-topic', () =>
    searchRssFeedItems({ topic_ids: seedTopicIds, limit: 25 }),
  )
  registerScenarioContract('post-search-new', {
    expectations: [],
    crossPartition: { posts: 'Search ranks eligible posts across the requested week.' },
  })
  await runAndCapture('post-search-new', () =>
    getPostIds(seedUser, { limit: 25, time_range: '1w' }),
  )
  registerScenarioContract('post-search-best', {
    expectations: [],
    crossPartition: { posts: 'Search ranks eligible posts across the requested week.' },
  })
  await runAndCapture('post-search-best', () =>
    getPostIds(seedUser, { sort: 'best', limit: 25, time_range: '1w' }),
  )
  registerScenarioContract('post-search-hot', {
    expectations: [],
    crossPartition: { posts: 'Search ranks eligible posts across the requested week.' },
  })
  await runAndCapture('post-search-hot', () =>
    getPostIds(seedUser, { sort: 'hot', limit: 25, time_range: '1w' }),
  )
  registerScenarioContract('rss-feed-item-feed-related-posts', {
    expectations: [
      { kind: 'custom', name: 'rssFeedCandidates' },
      {
        kind: 'maxProcessedRows',
        relation: 'rss_feed_item_sources',
        max: RSS_FEED_ITEM_SEED_COUNT * Math.ceil(RSS_FEED_SEED_COUNT / HOSTNAME_COUNT) * 3,
      },
      { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: RSS_FEED_ITEM_SEED_COUNT * 2 },
    ],
    crossPartition: {
      rss_feed_items: 'Related-item feed ranks matching items across the time window.',
    },
  })
  await runAndCapture('rss-feed-item-feed-related-posts', () =>
    getRssFeedItemFeedIds(seedUser, {
      limit: 25,
      time_range: '1w',
      has_related_posts: true,
    }),
  )
  registerScenarioContract('story-post-related-url-projection-source-page', {
    expectations: [{ kind: 'custom', name: 'paginationSpecial' }],
    crossPartition: {
      rss_feed_items: 'The story source page gathers matching items across id ranges.',
    },
  })
  await runAndCapture('story-post-related-url-projection-source-page', () =>
    getStoryPostRelatedUrlProjectionSourcePage({
      storyId: STORY_POST_RELATED_URL_PROJECTION_SEED.storyId,
      sourceCursorId: null,
      sourceHighWaterId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      limit: 100,
    }),
  )
}
