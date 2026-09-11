import { read } from '@data-stores/psql'
import {
  SEED_PREFIX,
  heavyFollowUser,
  runAndCapture,
  seedHostnameIds,
  seedParentTopicId,
  seedPostId,
  seedTopicId,
  seedUser,
} from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import * as services from '../run-services.mts'
import { runSemanticRssSearchScenario } from './semantic-rss-search.mts'

const {
  buildCommentTreeQuery,
  getEntityRelations,
  getPostFacets,
  getPostIds,
  getRecommendedTopics,
  searchRssFeedItems,
  searchRssFeeds,
  searchUrls,
} = services

export async function runSearchAndFacetScenarios() {
  // Comment tree — sort=new. Same root post seedComments() (comments-and-recently-viewed.mts)
  // built its 3-tier comment tree under.
  const seedCommentRootId = seedUuid(0, '05')
  await runAndCapture('comment-tree-new', () =>
    read(buildCommentTreeQuery(seedCommentRootId, { sort: 'new' })),
  )

  // Comment tree — sort=best
  await runAndCapture('comment-tree-best', () =>
    read(buildCommentTreeQuery(seedCommentRootId, { sort: 'best' })),
  )

  // Recommended topics
  await runAndCapture('recommended-topics', () =>
    getRecommendedTopics(seedUser as any, { limit: 25 }),
  )

  // Post search — text search
  await runAndCapture('post-search-text', () =>
    getPostIds(seedUser as any, { text_search_query: 'seed', limit: 25, time_range: '1w' }),
  )

  // RSS feed items search — by seeded feed id. The seed source rows intentionally share
  // hostnames across feeds, so this covers the broader shared-hostname source shape.
  const seedRssFeedId = `${SEED_PREFIX}-0800-7000-8000-000000000000`
  await runAndCapture(
    'rss-feed-items-search-by-rss-feed-source-group',
    () => searchRssFeedItems({ rss_feed_ids: [seedRssFeedId], limit: 25 }),
    'by-rss-feed-source-group',
  )

  // RSS feed items search — by category topic
  await runAndCapture(
    'rss-feed-items-search-by-category-topic',
    () => searchRssFeedItems({ category_topic_ids: [seedTopicId], limit: 25 }),
    'by-category-topic',
  )

  // RSS feed items search — text search
  await runAndCapture(
    'rss-feed-items-search-text',
    () => searchRssFeedItems({ text_search_query: 'seed', limit: 25 }),
    'text',
  )

  // RSS feed items search — media and cursor variants
  await runAndCapture(
    'rss-feed-items-search-media',
    () => searchRssFeedItems({ media_types: ['article'], limit: 25 }),
    'media',
  )
  await runAndCapture(
    'rss-feed-items-search-cursor',
    async () => {
      const firstPage = await searchRssFeedItems({ rss_feed_ids: [seedRssFeedId], limit: 10 })
      const after = firstPage.page_info.end_cursor
      if (after) await searchRssFeedItems({ rss_feed_ids: [seedRssFeedId], limit: 10, after })
    },
    'cursor',
  )
  await runAndCapture(
    'rss-feed-items-search-global-cursor',
    async () => {
      const firstPage = await searchRssFeedItems({ limit: 10 })
      const after = firstPage.page_info.end_cursor
      if (after) await searchRssFeedItems({ limit: 10, after })
    },
    'global-cursor',
  )
  await runSemanticRssSearchScenario()

  // RSS feed search — by topic
  await runAndCapture('rss-feed-search-by-topic', () =>
    searchRssFeeds({ topic_ids: [seedTopicId], limit: 25 }),
  )

  // RSS feed search — by topic descendants
  await runAndCapture('rss-feed-search-by-topic-descendants', () =>
    searchRssFeeds({ topic_ids: [seedParentTopicId], include_descendants: true, limit: 25 }),
  )

  // RSS feed search — publisher/current-user suppression variants
  await runAndCapture('rss-feed-search-by-publisher-type', () =>
    searchRssFeeds({ publisher_type_ids: [seedTopicId], limit: 25 }),
  )
  await runAndCapture('rss-feed-search-current-user', () =>
    searchRssFeeds({ current_user_id: seedUser.id, limit: 25 }),
  )

  // Post search — text search with heavy-follow user
  await runAndCapture(
    'post-search-text-heavy-follows',
    () =>
      getPostIds(heavyFollowUser as any, {
        text_search_query: 'seed',
        limit: 25,
        time_range: '1w',
      }),
    'heavy',
  )

  // Entity Relations — post→category→topic, two sort variants
  await runAndCapture(
    'entity-relations-best',
    () => getEntityRelations('post', seedPostId, 'category', 'topic', { sort: 'best', limit: 25 }),
    'best',
  )
  await runAndCapture(
    'entity-relations-newest',
    () =>
      getEntityRelations('post', seedPostId, 'category', 'topic', { sort: 'newest', limit: 25 }),
    'newest',
  )

  // Post Facets — baseline and text-search variants
  await runAndCapture(
    'post-facets',
    () => getPostFacets(seedUser as any, { limit: 25, time_range: '1w' }),
    'baseline',
  )
  await runAndCapture(
    'post-facets-text',
    () =>
      getPostFacets(seedUser as any, { text_search_query: 'seed', limit: 25, time_range: '1w' }),
    'text',
  )

  // Post search — relationship filter variants
  await runAndCapture(
    'post-search-review-topic',
    () => getPostIds(seedUser as any, { review_topic_ids: [seedTopicId], limit: 25 }),
    'review-topic',
  )
  await runAndCapture(
    'post-search-data-point-topic',
    () => getPostIds(seedUser as any, { data_point_topic_ids: [seedTopicId], limit: 25 }),
    'data-point-topic',
  )
  await runAndCapture(
    'post-search-universal-topic',
    () => getPostIds(seedUser as any, { universal_topic_ids: [seedTopicId], limit: 25 }),
    'universal-topic',
  )

  // URL Search — baseline, text-search, and hostname filter variants
  await runAndCapture('url-search', () => searchUrls({ limit: 25 }), 'baseline')
  await runAndCapture('url-search-text', () => searchUrls({ query: 'seed', limit: 25 }), 'text')
  await runAndCapture(
    'url-search-hostname',
    () => searchUrls({ hostnameId: seedHostnameIds[0], limit: 25 }),
    'hostname',
  )
}
