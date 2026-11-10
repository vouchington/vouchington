import { getPostsWorkLimit } from '../../work-limits.mts'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { PostSearchOptions, PostSearchSort } from '../types.mts'
import { buildStablePostHotRankExpression } from '../stable-hot-rank.mts'
import { appendCandidateCursor, candidateOrder } from './bounded-candidate-cursor.mts'
import {
  appendSourceEmbeddingGuards,
  buildDataPointTopicRawCandidates,
  candidateLimitLiteral,
  indexServedDataPointFilter,
  indexServedPostType,
} from './bounded-candidate-indexes.mts'
import { indexServedDataPointTopicId } from '../topic-best-cohort.mts'
import { buildPostSearchTimeRangeFilter } from '../hacker-news-hot-options.mts'
import { buildTimeRangeFilter } from '@modules/feed-query-builders/time-range'

export function candidateCap(options: PostSearchOptions): number {
  return options.cohort_cap ?? getPostsWorkLimit('post_search_filter_candidate_limit')
}

/** Only index-served predicates precede LIMIT; every selective residual follows the cap. */
export function buildRawCandidates(
  options: PostSearchOptions,
  sort: PostSearchSort,
  cap: number,
  topicBestCohort: boolean,
  includePostRows: boolean,
  decisionInstant: Date,
): SQLStatement {
  const topicId = indexServedDataPointTopicId(options, topicBestCohort ? 'best' : sort)
  const newestSort = sort === 'new' || sort === 'relevance' || sort === 'following_new'
  if (topicId) {
    const topicTimeFilter =
      !topicBestCohort && newestSort
        ? buildTimeRangeFilter(options.time_range ?? 'all', 'topic_post.post_id', decisionInstant)
        : null
    return buildDataPointTopicRawCandidates(topicId, cap, options, topicBestCohort, topicTimeFilter)
  }
  const query = sql`raw_post_search_candidates AS MATERIALIZED (
    SELECT `
  query.append(includePostRows ? sql`posts.*` : sql`posts.id`)
  if (sort === 'best' && !includePostRows) query.append(sql`, posts.votes_score_sort`)
  if (sort === 'hot' || sort === 'trending') {
    query
      .append(sql`, `)
      .append(buildStablePostHotRankExpression())
      .append(sql` AS stable_hot_rank`)
  }
  // Bare author and primary-key walks inspect deleted keys within the cap and filter later.
  const authorAxis = Boolean(
    options.user_id &&
    !options.community_id &&
    (sort === 'new' || sort === 'relevance' || sort === 'following_new'),
  )
  const dataPointFilter = authorAxis ? null : indexServedDataPointFilter(options, sort)
  // Each indexed data-point predicate requires structured data, which the posts CHECKs
  // allow only on data_point posts. Avoid a redundant type index scan in generic plans.
  const postTypeFilter = authorAxis || dataPointFilter ? null : indexServedPostType(options, sort)
  const globalIdAxis =
    (sort === 'new' || sort === 'relevance' || sort === 'following_new') &&
    !options.community_id &&
    !postTypeFilter &&
    !dataPointFilter
  const communityIdAxis = Boolean(
    options.community_id && (sort === 'new' || sort === 'relevance' || sort === 'following_new'),
  )
  if (authorAxis) query.append(sql` FROM posts WHERE posts.created_by_id = ${options.user_id}`)
  else if (communityIdAxis)
    query.append(sql` FROM posts WHERE posts.community_id = ${options.community_id}`)
  else if (globalIdAxis) query.append(sql` FROM posts WHERE TRUE`)
  else query.append(sql` FROM posts WHERE posts.deleted_at IS NULL`)
  if (sort === 'hot' || sort === 'trending') query.append(sql` AND posts.votes_score_net > 0`)
  if (options.community_id && !communityIdAxis)
    query.append(sql` AND posts.community_id = ${options.community_id}`)
  if (postTypeFilter) query.append(postTypeFilter)
  if (dataPointFilter) query.append(dataPointFilter)
  if (newestSort) {
    const timeRangeFilter = buildPostSearchTimeRangeFilter(options, 'posts.id', decisionInstant)
    if (timeRangeFilter) query.append(sql` AND `).append(timeRangeFilter)
  }
  appendSourceEmbeddingGuards(query, options)
  appendCandidateCursor(query, options, sort)
  return query
    .append(sql` ORDER BY `)
    .append(candidateOrder(sort))
    .append(sql` LIMIT `)
    .append(candidateLimitLiteral(cap + 1)).append(sql`
  )`)
}
