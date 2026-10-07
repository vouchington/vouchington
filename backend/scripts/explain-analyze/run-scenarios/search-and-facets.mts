import { read } from '@data-stores/psql'
import {
  heavyFollowUser,
  runAndCapture,
  seedHostnameIds,
  seedParentTopicId,
  seedPostId,
  seedTopicId,
  seedUser,
} from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import * as services from '../run-services.mts'
import { runRssItemSearchScenarios } from './rss-item-search.mts'
import {
  runSemanticPostSearchScenarios,
  runSimilarPostSearchScenarios,
} from './semantic-post-search.mts'

const {
  ANONYMOUS_ENTITY_RELATION_VIEWER,
  buildCommentTreeQuery,
  getEntityRelations,
  getPostFacets,
  getPostIds,
  getRecommendedTopics,
  searchRssFeeds,
  searchUrls,
} = services

export async function runSearchAndFacetScenarios() {
  await runSemanticPostSearchScenarios()
  await runSimilarPostSearchScenarios()
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

  await runAndCapture('recommended-topics', () => getRecommendedTopics(seedUser, { limit: 25 }))

  // Post search — text search
  registerScenarioContract('post-search-text', {
    expectations: [],
    crossPartition: { posts: 'Text search ranks eligible posts across the requested week.' },
  })
  await runAndCapture('post-search-text', () =>
    getPostIds(seedUser, { text_search_query: 'seed', limit: 25, time_range: '1w' }),
  )

  await runRssItemSearchScenarios()

  registerScenarioContract('rss-feed-search-by-topic', {
    expectations: [{ kind: 'custom', name: 'rssStateProjection' }],
  })
  await runAndCapture('rss-feed-search-by-topic', () =>
    searchRssFeeds({ topic_ids: [seedTopicId], limit: 25 }),
  )

  registerScenarioContract('rss-feed-search-by-topic-descendants', {
    expectations: [{ kind: 'custom', name: 'rssStateProjection' }],
  })
  await runAndCapture('rss-feed-search-by-topic-descendants', () =>
    searchRssFeeds({ topic_ids: [seedParentTopicId], include_descendants: true, limit: 25 }),
  )

  registerScenarioContract('rss-feed-search-by-publisher-type', {
    expectations: [{ kind: 'custom', name: 'rssStateProjection' }],
  })
  await runAndCapture('rss-feed-search-by-publisher-type', () =>
    searchRssFeeds({ publisher_type_ids: [seedTopicId], limit: 25 }),
  )
  registerScenarioContract('rss-feed-search-current-user', {
    expectations: [{ kind: 'custom', name: 'rssStateProjection' }],
  })
  await runAndCapture('rss-feed-search-current-user', () =>
    searchRssFeeds({ current_user_id: seedUser.id, limit: 25 }),
  )

  // Post search — text search with heavy-follow user
  registerScenarioContract('post-search-text-heavy-follows', {
    expectations: [],
    crossPartition: { posts: 'Text search ranks eligible posts across the requested week.' },
  })
  await runAndCapture(
    'post-search-text-heavy-follows',
    () =>
      getPostIds(heavyFollowUser, {
        text_search_query: 'seed',
        limit: 25,
        time_range: '1w',
      }),
    'heavy',
  )

  // Entity Relations — post→category→topic, two sort variants
  registerScenarioContract('entity-relations-best', {
    expectations: [{ kind: 'custom', name: 'relationListingOrder' }],
  })
  await runAndCapture(
    'entity-relations-best',
    () =>
      getEntityRelations('post', seedPostId, 'category', 'topic', {
        viewer: ANONYMOUS_ENTITY_RELATION_VIEWER,
        sort: 'best',
        limit: 25,
      }),
    'best',
  )
  registerScenarioContract('entity-relations-newest', {
    expectations: [{ kind: 'custom', name: 'relationListingOrder' }],
  })
  await runAndCapture(
    'entity-relations-newest',
    () =>
      getEntityRelations('post', seedPostId, 'category', 'topic', {
        viewer: ANONYMOUS_ENTITY_RELATION_VIEWER,
        sort: 'newest',
        limit: 25,
      }),
    'newest',
  )

  registerScenarioContract('post-facets', {
    expectations: [],
    crossPartition: { posts: 'Facets aggregate eligible posts across the requested week.' },
  })
  await runAndCapture(
    'post-facets',
    () => getPostFacets(seedUser, { limit: 25, time_range: '1w' }),
    'baseline',
  )
  registerScenarioContract('post-facets-text', {
    expectations: [],
    crossPartition: { posts: 'Text facets aggregate eligible posts across the requested week.' },
  })
  await runAndCapture(
    'post-facets-text',
    () => getPostFacets(seedUser, { text_search_query: 'seed', limit: 25, time_range: '1w' }),
    'text',
  )

  // Post search — relationship filter variants
  registerScenarioContract('post-search-review-topic', {
    expectations: [],
    crossPartition: {
      posts: 'Review-topic search ranks matching posts across id ranges.',
      post_review_topic_ratings: 'The topic filter matches ratings across many posts.',
    },
  })
  await runAndCapture(
    'post-search-review-topic',
    () => getPostIds(seedUser, { review_topic_ids: [seedTopicId], limit: 25 }),
    'review-topic',
  )
  registerScenarioContract('post-search-data-point-topic', {
    expectations: [],
    crossPartition: {
      posts: 'Data-point-topic search ranks matching posts across id ranges.',
      post_data_point_topics: 'The topic filter matches data points across many posts.',
    },
  })
  await runAndCapture(
    'post-search-data-point-topic',
    () => getPostIds(seedUser, { data_point_topic_ids: [seedTopicId], limit: 25 }),
    'data-point-topic',
  )
  registerScenarioContract('post-search-universal-topic', {
    expectations: [{ kind: 'custom', name: 'universalTopicCandidates' }],
    crossPartition: {
      posts: 'Universal-topic search ranks matching posts across id ranges.',
      relation__post__category__topic:
        'Universal-topic search reads category relations across posts.',
      post_review_topic_ratings: 'Universal-topic search reads ratings across posts.',
      post_data_point_topics: 'Universal-topic search reads data points across posts.',
    },
  })
  await runAndCapture(
    'post-search-universal-topic',
    () => getPostIds(seedUser, { universal_topic_ids: [seedTopicId], limit: 25 }),
    'universal-topic',
  )

  await runAndCapture('url-search', () => searchUrls({ limit: 25 }), 'baseline')
  await runAndCapture('url-search-text', () => searchUrls({ query: 'seed', limit: 25 }), 'text')
  await runAndCapture(
    'url-search-hostname',
    () => searchUrls({ hostnameId: seedHostnameIds[0], limit: 25 }),
    'hostname',
  )
}
