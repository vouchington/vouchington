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
import { usesBoundedPostSearchCandidates } from './query-builder/bounded-candidates.mts'
import {
  buildDefaultBoundedPage,
  buildFollowingBoundedPage,
  buildRelevanceBoundedPage,
} from './get-ids-bounded-page.mts'

type PostSearchResponse = {
  results: PostSearchResult[]
  page_info: ReturnType<typeof buildPostSearchPageInfo>
}

type BoundedSearchRow = Omit<PostSearchRow, 'id'> & {
  id: string | null
  candidate_has_more?: boolean
  inspected_id?: string | null
  inspected_score?: string | number | null
  cohort_hi?: string | null
  cohort_lo?: string | null
  candidate_cap?: number
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
  if (usesHackerNewsHotCandidates(options) || usesBoundedPostSearchCandidates(options, sort)) {
    await postsWorkConfig.waitForInitialization()
  }
  const hasTextSearch = hasTextSearchFn(options)
  // Fetch embedding before cursor decode so hasSemanticSearch and hasRankingScore
  // mirror the builder's SELECT decision (embedding presence required, not just query string).
  let semanticSearchEmbedding: number[] | undefined
  if (hasSemanticSearchFn(options)) {
    semanticSearchEmbedding = await getCachedSearchEmbedding(options.semantic_search_query!)
  }
  const hasSemanticSearch = hasSemanticSearchFn(options) && semanticSearchEmbedding !== undefined
  const boundedCandidates = usesBoundedPostSearchCandidates(
    { ...options, semanticSearchEmbedding },
    sort,
  )
  const hasRankingScore =
    buildPostRankingScoreExpression({ hasTextSearch, hasSemanticSearch }) !== null
  // Post search is always time-bounded; callers needing the full history pass 'all'. Only an
  // author's own drafts listing (their user id plus drafts) keeps that full history.
  const effectiveTimeRange =
    options.time_range ??
    (isOwnDraftsListing(currentUser, options) ? 'all' : DEFAULT_POST_SEARCH_TIME_RANGE)
  const cursor = decodePostSearchCursor(options, sort, hasRankingScore, boundedCandidates)
  // Build query - pass decoded cursor values and use limit + 1
  const queryOptions: PostSearchOptions = {
    ...options,
    time_range: effectiveTimeRange,
    semanticSearchEmbedding,
    limit: limit + 1,
  }
  Object.assign(queryOptions, cursor)
  const query = buildPostSearchQuery(currentUser, queryOptions)
  const { rows } = await executePostSearchQuery<BoundedSearchRow>(query, hasSemanticSearch)
  const typedRows = rows.filter((row): row is BoundedSearchRow & PostSearchRow => row.id !== null)
  const resultRows = typedRows.slice(0, limit)
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
  const pageInfo =
    boundedCandidates && sort === 'following_new'
      ? buildFollowingBoundedPage(typedRows, rows[0], limit, cursor)
      : boundedCandidates && sort === 'relevance' && hasRankingScore
        ? buildRelevanceBoundedPage(typedRows, rows[0], limit, cursor)
        : buildDefaultBoundedPage(
            typedRows,
            rows[0],
            limit,
            sort,
            hasRankingScore,
            boundedCandidates,
          )
  return {
    results,
    page_info: pageInfo,
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
