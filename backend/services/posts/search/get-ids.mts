import { clampLimit } from '@services/pagination'
import type { BasicUser } from '@services/users/types'
import type { PostSearchOptions, PostSearchResult } from './types.mts'
import { buildPostSearchQuery } from './query-builder.mts'
import { executePostSearchQuery } from './execute-query.mts'
import { readFollowingNewRows } from './get-ids-following.mts'
import { getCachedSearchEmbedding } from '@services/bedrock-embeddings/search/get-cached'
import {
  hasSemanticSearch as hasSemanticSearchFn,
  hasTextSearch as hasTextSearchFn,
  detectSearchSort,
} from '@modules/search-utils'
import { buildPostRankingScoreExpression } from './query-builder-utils.mts'
import createHttpError from 'http-errors'
import { isUUID } from '@modules/utils'
import { buildPostSearchPageInfo, decodePostSearchCursor } from './get-ids-page-info.mts'
import { readInspectedTail } from './get-ids-topic-walk.mts'
import type { PostSearchRow } from './get-ids-types.mts'

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
  if (options.community_id !== undefined && !isUUID(options.community_id)) {
    throw createHttpError(400, 'community_id must be a valid UUID')
  }
  if (options.trending_topic_id !== undefined && !isUUID(options.trending_topic_id)) {
    throw createHttpError(400, 'trending_topic_id must be a valid UUID')
  }
  if (
    options.trending_min_score !== undefined &&
    (!Number.isFinite(options.trending_min_score) || options.trending_min_score < 0)
  ) {
    throw createHttpError(400, 'trending_min_score must be nonnegative and finite')
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
  // An omitted range has no age filter. An explicit finite code keeps the first page's bound.
  const { id_lt, vote_score_lt, ranking_lt, hot_score_lt, as_of_ms } = decodePostSearchCursor(
    options,
    sort,
    hasRankingScore,
  )
  const finiteTimeRange = options.time_range !== undefined && options.time_range !== 'all'
  const asOfMs = finiteTimeRange ? (as_of_ms ?? Date.now()) : undefined
  const queryOptions: PostSearchOptions = {
    ...options,
    semanticSearchEmbedding,
    limit: limit + 1,
    ...(asOfMs === undefined ? {} : { time_range_as_of: new Date(asOfMs) }),
  }
  if (id_lt !== undefined) queryOptions.id_lt = id_lt
  if (vote_score_lt !== undefined) queryOptions.vote_score_lt = vote_score_lt
  if (ranking_lt !== undefined) queryOptions.ranking_lt = ranking_lt
  if (hot_score_lt !== undefined) queryOptions.hot_score_lt = hot_score_lt
  const followedPage =
    sort === 'following_new' && currentUser
      ? await readFollowingNewRows(currentUser, queryOptions, limit, hasSemanticSearch)
      : undefined
  const singleQuery = followedPage
    ? undefined
    : await executePostSearchQuery<PostSearchRow>(
        buildPostSearchQuery(currentUser, queryOptions),
        hasSemanticSearch,
      )
  const rows = followedPage?.rows ?? singleQuery?.rows ?? []
  const hasNextPage = followedPage?.hasNextPage ?? rows.length > limit
  const resultRows = followedPage ? rows : rows.slice(0, limit)
  // A capped topic walk that ran out of inspected rows before a full page returns a short page.
  const inspectedTail =
    singleQuery && !hasNextPage
      ? await readInspectedTail(currentUser, queryOptions, sort, hasSemanticSearch)
      : undefined
  const results: PostSearchResult[] = resultRows.map(row => ({
    __entity_type: 'post',
    id: row.id,
    post_type: row.post_type,
    ...(row.title === undefined
      ? {}
      : {
          title: row.title,
          data_point_vertical: row.data_point_vertical ?? null,
          structured_data: row.structured_data ?? null,
        }),
    ...(sort === 'trending' && options.include_trending_score
      ? { trending_score: Number(row.trending_score) }
      : {}),
  }))
  return {
    results,
    page_info: buildPostSearchPageInfo(
      resultRows,
      hasNextPage,
      sort,
      hasRankingScore,
      { timeRange: options.time_range, asOfMs },
      inspectedTail,
    ),
  }
}
