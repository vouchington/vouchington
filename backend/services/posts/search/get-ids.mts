import { clampLimit } from '@services/pagination'
import type { BasicUser } from '@services/users/types'
import type { PostSearchOptions, PostSearchResult } from './types.mts'
import { buildPostSearchQuery } from './query-builder.mts'
import { executePostSearchQuery } from './execute-query.mts'
import { getCachedSearchEmbedding } from '@services/bedrock-embeddings/search/get-cached'
import {
  hasSemanticSearch as hasSemanticSearchFn,
  hasTextSearch as hasTextSearchFn,
  detectSearchSort,
} from '@modules/search-utils'
import { buildPostRankingScoreExpression } from './query-builder-utils.mts'
import createHttpError from 'http-errors'
import { isUUID } from '@modules/utils'
import { DEFAULT_POST_SEARCH_TIME_RANGE } from '@modules/feed-query-builders'
import { buildPostSearchPageInfo, decodePostSearchCursor } from './get-ids-page-info.mts'
import type { PostSearchRow } from './get-ids-types.mts'
import { usesHackerNewsHotCandidates } from './hacker-news-hot-options.mts'
import { postsWorkConfig } from '../work-limits.mts'

type PostSearchResponse = {
  results: PostSearchResult[]
  page_info: ReturnType<typeof buildPostSearchPageInfo>
}

export async function getPostIds(
  currentUser?: BasicUser,
  options: PostSearchOptions = {},
): Promise<PostSearchResponse> {
  if (usesHackerNewsHotCandidates(options)) await postsWorkConfig.waitForInitialization()
  if (options.similar_rss_feed_item_id !== undefined && !isUUID(options.similar_rss_feed_item_id)) {
    throw createHttpError(400, 'similar_rss_feed_item_id must be a valid UUID')
  }
  const limit = clampLimit(options.limit)
  const rawSort = detectSearchSort(options)
  const sort = rawSort === 'following_new' && !currentUser ? 'new' : rawSort
  const hasTextSearch = hasTextSearchFn(options)
  // Fetch embedding before cursor decode so hasSemanticSearch and hasRankingScore
  // mirror the builder's SELECT decision (embedding presence required, not just query string).
  let semanticSearchEmbedding: number[] | undefined
  if (hasSemanticSearchFn(options)) {
    semanticSearchEmbedding = await getCachedSearchEmbedding(options.semantic_search_query!)
  }
  const hasSemanticSearch = hasSemanticSearchFn(options) && semanticSearchEmbedding !== undefined
  const hasRankingScore =
    buildPostRankingScoreExpression({ hasTextSearch, hasSemanticSearch }) !== null
  // Post search is always time-bounded; callers needing the full history pass 'all'. Only an
  // author's own drafts listing (their user id plus drafts) keeps that full history.
  const effectiveTimeRange =
    options.time_range ??
    (isOwnDraftsListing(currentUser, options) ? 'all' : DEFAULT_POST_SEARCH_TIME_RANGE)
  const { id_lt, vote_score_lt, ranking_lt, hot_score_lt } = decodePostSearchCursor(
    options,
    sort,
    hasRankingScore,
  )
  // Build query - pass decoded cursor values and use limit + 1
  const queryOptions: PostSearchOptions = {
    ...options,
    time_range: effectiveTimeRange,
    semanticSearchEmbedding,
    limit: limit + 1,
  }
  if (id_lt !== undefined) queryOptions.id_lt = id_lt
  if (vote_score_lt !== undefined) queryOptions.vote_score_lt = vote_score_lt
  if (ranking_lt !== undefined) queryOptions.ranking_lt = ranking_lt
  if (hot_score_lt !== undefined) queryOptions.hot_score_lt = hot_score_lt
  const query = buildPostSearchQuery(currentUser, queryOptions)
  const { rows } = await executePostSearchQuery(query, hasSemanticSearch)
  const typedRows = rows as PostSearchRow[]
  const hasNextPage = typedRows.length > limit
  const resultRows = typedRows.slice(0, limit)
  const results: PostSearchResult[] = resultRows.map(row => ({
    __entity_type: 'post',
    id: row.id,
    post_type: row.post_type,
  }))
  return {
    results,
    page_info: buildPostSearchPageInfo(resultRows, hasNextPage, sort, hasRankingScore),
  }
}

function isOwnDraftsListing(
  currentUser: BasicUser | undefined,
  options: PostSearchOptions,
): boolean {
  return (
    options.drafts === true && currentUser?.id !== undefined && currentUser.id === options.user_id
  )
}
