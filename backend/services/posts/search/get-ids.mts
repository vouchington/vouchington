import type { BasicUser } from '@services/users/types'
import type { PostSearchOptions, PostSearchResult } from './types.mts'
import { buildPostSearchQuery } from './query-builder.mts'
import { read } from '@data-stores/psql'
import { getCachedSearchEmbedding } from '@services/bedrock-embeddings/search/get-cached'
import {
  hasSemanticSearch as hasSemanticSearchFn,
  hasTextSearch as hasTextSearchFn,
  detectSearchSort,
  clampLimit,
} from '@modules/search-utils'
import { buildPostRankingScoreExpression } from './query-builder-utils.mts'
import createHttpError from 'http-errors'
import { isUUID } from '@modules/utils'
import { buildPostSearchPageInfo, decodePostSearchCursor } from './get-ids-page-info.mts'

export type PostSearchRow = {
  id: string
  post_type: string
  vote_score?: string | number
  ranking_score?: string | number
  following_rank?: string | number
  hot_score?: string | number
}
type PostSearchResponse = {
  results: PostSearchResult[]
  page_info: ReturnType<typeof buildPostSearchPageInfo>
}

export async function getPostIds(
  currentUser?: BasicUser,
  options: PostSearchOptions = {},
): Promise<PostSearchResponse> {
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

  const { id_lt, vote_score_lt, ranking_lt, hot_score_lt } = decodePostSearchCursor(
    options,
    sort,
    hasRankingScore,
  )
  // Default time_range to '1w' for hot sort when not explicitly provided
  const effectiveTimeRange = sort === 'hot' && !options.time_range ? '1w' : options.time_range
  // Build query - pass decoded cursor values and use limit + 1
  const queryOptions: PostSearchOptions = {
    ...options,
    ...(effectiveTimeRange !== undefined && { time_range: effectiveTimeRange }),
    semanticSearchEmbedding,
    limit: limit + 1,
  }
  if (id_lt !== undefined) queryOptions.id_lt = id_lt
  if (vote_score_lt !== undefined) queryOptions.vote_score_lt = vote_score_lt
  if (ranking_lt !== undefined) queryOptions.ranking_lt = ranking_lt
  if (hot_score_lt !== undefined) queryOptions.hot_score_lt = hot_score_lt
  const query = buildPostSearchQuery(currentUser, queryOptions)
  const { rows } = await read(query)
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
