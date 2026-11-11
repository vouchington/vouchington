import { read } from '@data-stores/psql'
import buildCommentTreeQuery from '@services/comments/query-builder'
import {
  heavyFollowUser,
  runAndCapture,
  seedHostnameIds,
  seedPostId,
  seedUser,
} from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import { seedRecentlyViewedPosts } from '../seed-data/comments-and-recently-viewed.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import {
  ANONYMOUS_ENTITY_RELATION_VIEWER,
  getEntityRelations,
  getPostFacets,
  getPostIds,
  getRecommendedTopics,
  searchUrls,
} from '../run-services.mts'
import { runRecommendedTopicsVoteHistoryScenario } from './recommended-topics-vote-history.mts'
import { runWebSearchScenarios } from './web-search.mts'
import { runRssItemSearchScenarios } from './rss-item-search.mts'
import { runRssFeedSearchScopeScenarios } from './rss-feed-search.mts'
import {
  runSemanticPostSearchScenarios,
  runSimilarPostSearchScenarios,
} from './semantic-post-search.mts'
import { runPostSearchRelationshipFilterScenarios } from './post-search-relationship-filters.mts'

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

  // The query reads the viewer's recently viewed posts from Valkey, which a restored shard starts
  // without. Write the same 500 seeded posts its read window takes.
  await seedRecentlyViewedPosts(500)
  await runAndCapture('recommended-topics', () => getRecommendedTopics(seedUser, { limit: 25 }))
  await runRecommendedTopicsVoteHistoryScenario()

  // Post search — text search
  registerScenarioContract('post-search-text', {
    expectations: [],
    crossPartition: { posts: 'Text search ranks eligible posts across the requested week.' },
  })
  await runAndCapture('post-search-text', () =>
    getPostIds(seedUser, { text_search_query: 'seed', limit: 25, time_range: '1w' }),
  )

  await runRssItemSearchScenarios()

  await runRssFeedSearchScopeScenarios()

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

  await runPostSearchRelationshipFilterScenarios()

  await runAndCapture('url-search', () => searchUrls({ limit: 25 }), 'baseline')
  await runAndCapture('url-search-text', () => searchUrls({ query: 'seed', limit: 25 }), 'text')
  await runAndCapture(
    'url-search-hostname',
    () => searchUrls({ hostnameId: seedHostnameIds[0], limit: 25 }),
    'hostname',
  )
  await runWebSearchScenarios()
}
