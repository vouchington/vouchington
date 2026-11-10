import { encodeCursor } from '@modules/pagination'
import { postSearchCursorScope } from '@services/posts/search/get-ids-cursor'
import type { PostSearchOptions } from '@voucha/types/entities/post-search'
import { runAndCapture, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import { getPostIds } from '../run-services.mts'
import { registerNamedPostIndexGate, registerPostDiscoveryGate } from '../post-discovery-gates.mts'
import { runPostDiscoveryFiniteWindowScenario } from './post-discovery-finite-window.mts'

const PAGE_SIZE = 25
const POST_SEARCH_QUERY = 'buildPostSearchQuery'

async function getPage(options: PostSearchOptions) {
  return getPostIds(seedUser, options)
}

async function capture(id: string, options: PostSearchOptions): Promise<void> {
  await runAndCapture(id, () => getPage(options), undefined, POST_SEARCH_QUERY)
}

async function registerGate(
  id: string,
  allowEmptyResult = false,
  follows = false,
  indexName = '',
  rowCap?: number | null,
): Promise<void> {
  await registerNamedPostIndexGate(id, indexName, {
    allowEmpty: allowEmptyResult,
    follows,
    rowCap,
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
  await registerGate(firstId, allowEmptyFirst, follows, '', null)
  await capture(firstId, options)

  const continuationId = `${prefix}-continuation`
  await registerGate(continuationId, true, follows, '', null)
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
  if (
    sparseFirst.results.length > 1 ||
    sparseFirst.page_info.has_next_page ||
    sparseFirst.page_info.end_cursor
  )
    throw new Error('Numeric keyword search must return at most one post and then stop')
  const sparseFirstId = 'post-discovery-keyword-relevance-sparse-first'
  await registerGate(sparseFirstId, true, false, '', null)
  await capture(sparseFirstId, sparseOptions)

  const emptyOptions = { ...broadOptions, text_search_query: 'no-matching-seed-token-4989' }
  const emptyFirst = await getPage(emptyOptions)
  if (
    emptyFirst.results.length !== 0 ||
    emptyFirst.page_info.has_next_page ||
    emptyFirst.page_info.end_cursor
  )
    throw new Error('Empty keyword search must be exhausted')
  const emptyFirstId = 'post-discovery-keyword-relevance-empty-first'
  await registerGate(emptyFirstId, true, false, '', null)
  await capture(emptyFirstId, emptyOptions)
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
  await registerGate(authorNewId, false, false, 'idx_posts__created_by_id')
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
  await registerPostDiscoveryGate(missingId, 'community', 'new', true)
  await capture(missingId, missingCommunity)

  const exhaustedRecommendationId = 'post-discovery-recommendation-new-exhausted'
  const exhaustedRecommendation: PostSearchOptions = {
    sort: 'new',
    time_range: 'all',
    limit: PAGE_SIZE,
    post_types: ['topic_recommendation'],
    topic_recommendation_status: 'pending',
    after: encodeCursor({
      id: seedUuid(45_000, '05'),
      scope: postSearchCursorScope('new', 'all'),
    }),
  }
  const exhaustedPage = await getPage(exhaustedRecommendation)
  if (
    exhaustedPage.results.length !== 0 ||
    exhaustedPage.page_info.has_next_page ||
    exhaustedPage.page_info.end_cursor !== null
  )
    throw new Error('Exhausted recommendation cursor must return no fixture rows')
  await registerPostDiscoveryGate(exhaustedRecommendationId, 'recommendation', 'new', true)
  await capture(exhaustedRecommendationId, exhaustedRecommendation)
}
