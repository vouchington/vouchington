import { encodeCursor } from '@modules/pagination'
import { postSearchRankingCursorScope } from '@services/posts/search/get-ids-page-info'
import type { PostSearchOptions } from '@voucha/types/entities/post-search'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import { getPostIds } from '../run-services.mts'
import { registerPostDiscoveryGate } from '../post-discovery-gates.mts'
import { POST_DISCOVERY_FIXTURE_SEEDED_ROWS } from '../post-discovery-seeded-rows.mts'
import { runPostDiscoveryFiniteWindowScenario } from './post-discovery-finite-window.mts'

const PAGE_SIZE = 25
const EXPECTED_POST_WORK = 3010
const POST_SEARCH_QUERY = 'buildPostSearchQuery'
const EXHAUSTED_RELEVANCE_CURSOR = encodeCursor({
  ranking: -1,
  id: '00000000-0000-7000-8000-000000000001',
  scope: postSearchRankingCursorScope.relevance,
})

async function getPage(options: PostSearchOptions) {
  return getPostIds(seedUser, options)
}

async function capture(id: string, options: PostSearchOptions): Promise<void> {
  await runAndCapture(id, () => getPage(options), undefined, POST_SEARCH_QUERY)
}

function registerGate(
  id: string,
  allowEmptyResult = false,
  follows = false,
  indexes?: readonly string[],
): void {
  registerScenarioContract(id, {
    seededRows: POST_DISCOVERY_FIXTURE_SEEDED_ROWS,
    expectations: [
      { kind: 'maxProcessedRows', relation: 'posts', max: EXPECTED_POST_WORK },
      { kind: 'maxBitmapIndexRows', max: 1050 },
      ...(indexes ? [{ kind: 'usesIndexes' as const, indexes, anyOf: true }] : []),
      ...(follows
        ? [
            {
              kind: 'maxProcessedRows' as const,
              relation: 'relation__user__follow__user',
              max: EXPECTED_POST_WORK,
            },
          ]
        : []),
    ],
    allowEmptyResult,
    crossPartition: {
      posts:
        'Unscoped post search walks retained history by the sort key and stops at the inspected-row cap.',
    },
  })
}

async function captureCursorPair(
  prefix: string,
  options: PostSearchOptions,
  { allowEmptyFirst = false, follows = false } = {},
): Promise<void> {
  const first = await getPage(options)
  const cursor = first.page_info.end_cursor
  if (!first.page_info.has_next_page || !cursor)
    throw new Error(`${prefix} must return a continuation cursor`)
  if (!allowEmptyFirst && first.results.length === 0)
    throw new Error(`${prefix} first page must contain a post`)

  const firstId = `${prefix}-first`
  registerGate(firstId, allowEmptyFirst, follows)
  await capture(firstId, options)

  const continuationId = `${prefix}-continuation`
  registerGate(continuationId, true, follows)
  await capture(continuationId, { ...options, after: cursor })
}

async function captureKeywordRelevanceScenarios(): Promise<void> {
  const broadOptions: PostSearchOptions = {
    sort: 'relevance',
    text_search_query: 'seed',
    time_range: 'all',
    limit: PAGE_SIZE,
  }
  await captureCursorPair('post-discovery-keyword-relevance', broadOptions, {
    allowEmptyFirst: true,
  })
  await captureCursorPair('post-discovery-keyword-relevance-community', {
    ...broadOptions,
    community_id: seedUuid(100, '14'),
  })

  const sparseOptions = { ...broadOptions, text_search_query: '139999' }
  const sparseFirst = await getPage(sparseOptions)
  if (sparseFirst.results.length > 1)
    throw new Error('Numeric keyword search must return at most one post')
  const sparseFirstId = 'post-discovery-keyword-relevance-sparse-first'
  registerGate(sparseFirstId, true)
  await capture(sparseFirstId, sparseOptions)

  const sparseContinuationId = 'post-discovery-keyword-relevance-sparse-continuation'
  const sparseContinuation = {
    ...sparseOptions,
    after: sparseFirst.page_info.end_cursor ?? EXHAUSTED_RELEVANCE_CURSOR,
  }
  const sparseContinuationPage = await getPage(sparseContinuation)
  if (sparseContinuationPage.results.length > 1)
    throw new Error('Sparse keyword continuation must return at most one post')
  registerGate(sparseContinuationId, true)
  await capture(sparseContinuationId, sparseContinuation)

  const emptyOptions = { ...broadOptions, text_search_query: 'no-matching-seed-token-4989' }
  const emptyFirst = await getPage(emptyOptions)
  if (emptyFirst.results.length !== 0 || emptyFirst.page_info.has_next_page)
    throw new Error('Unmatched keyword search must be an exhausted empty page')
  const emptyFirstId = 'post-discovery-keyword-relevance-empty-first'
  registerGate(emptyFirstId, true)
  await capture(emptyFirstId, emptyOptions)

  const emptyContinuationId = 'post-discovery-keyword-relevance-empty-continuation'
  const emptyContinuation = {
    ...emptyOptions,
    after: EXHAUSTED_RELEVANCE_CURSOR,
  }
  const emptyContinuationPage = await getPage(emptyContinuation)
  if (emptyContinuationPage.results.length !== 0)
    throw new Error('Empty keyword cursor must remain empty in its continuation')
  registerGate(emptyContinuationId, true)
  await capture(emptyContinuationId, emptyContinuation)
}

export async function runPostDiscoveryUnscopedScenarios(): Promise<void> {
  await runPostDiscoveryFiniteWindowScenario()
  await captureCursorPair('post-discovery-global-new', {
    sort: 'new',
    time_range: 'all',
    limit: PAGE_SIZE,
  })
  await captureCursorPair('post-discovery-global-best', {
    sort: 'best',
    time_range: 'all',
    limit: PAGE_SIZE,
  })
  const authorNewId = 'post-discovery-author-new'
  registerGate(authorNewId, false, false, [
    'idx_posts__created_by_id',
    'posts__default_created_by_id_id_idx',
  ])
  await capture(authorNewId, {
    user_id: seedUser.id,
    sort: 'new',
    time_range: 'all',
    limit: PAGE_SIZE,
  })
  await captureCursorPair(
    'post-discovery-global-following-new',
    { sort: 'following_new', time_range: 'all', limit: PAGE_SIZE },
    { allowEmptyFirst: true, follows: true },
  )
  await captureKeywordRelevanceScenarios()

  const missingCommunity: PostSearchOptions = {
    sort: 'new',
    time_range: 'all',
    limit: PAGE_SIZE,
    community_id: seedUuid(999_999, '14'),
  }
  const missingPage = await getPage(missingCommunity)
  if (
    missingPage.results.length !== 0 ||
    missingPage.page_info.has_next_page ||
    missingPage.page_info.end_cursor !== null
  )
    throw new Error('Missing community must be an exhausted empty page without a cursor')
  const missingId = 'post-discovery-community-new-missing-parent'
  registerPostDiscoveryGate(missingId, 'community', 'new', true)
  await capture(missingId, missingCommunity)

  const exhaustedRecommendationId = 'post-discovery-recommendation-new-exhausted'
  const exhaustedRecommendation: PostSearchOptions = {
    sort: 'new',
    time_range: 'all',
    limit: PAGE_SIZE,
    post_types: ['topic_recommendation'],
    topic_recommendation_status: 'pending',
    after: encodeCursor({ id: seedUuid(45_000, '05') }),
  }
  const exhaustedPage = await getPage(exhaustedRecommendation)
  if (
    exhaustedPage.results.length !== 0 ||
    exhaustedPage.page_info.has_next_page ||
    exhaustedPage.page_info.end_cursor !== null
  )
    throw new Error('Exhausted recommendation cursor must return no fixture rows')
  registerPostDiscoveryGate(exhaustedRecommendationId, 'recommendation', 'new', true)
  await capture(exhaustedRecommendationId, exhaustedRecommendation)
}
