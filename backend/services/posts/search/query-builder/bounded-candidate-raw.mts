import { getPostsWorkLimit } from '../../work-limits.mts'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { PostSearchOptions } from '../types.mts'
import { buildStablePostHotRankExpression } from '../stable-hot-rank.mts'
import { appendCandidateCursor, candidateOrder } from './bounded-candidate-cursor.mts'
import {
  appendSourceEmbeddingGuards,
  buildDataPointTopicRawCandidates,
  indexServedDataPointFilter,
  indexServedPostType,
} from './bounded-candidate-indexes.mts'

export type CandidateSort = 'new' | 'best' | 'hot' | 'trending' | 'relevance' | 'following_new'

export function candidateCap(options: PostSearchOptions): number {
  return options.cohort_cap ?? getPostsWorkLimit('post_search_filter_candidate_limit')
}

/** Only index-served predicates precede LIMIT; every selective residual follows the cap. */
export function buildRawCandidates(
  options: PostSearchOptions,
  sort: CandidateSort,
  cap: number,
): SQLStatement {
  const topicId =
    sort === 'new' &&
    options.post_types?.length === 1 &&
    options.post_types[0] === 'data_point' &&
    options.data_point_topic_ids?.length === 1
      ? options.data_point_topic_ids[0]
      : undefined
  if (topicId) return buildDataPointTopicRawCandidates(topicId, options.id_lt, cap, options)
  const query = sql`raw_post_search_candidates AS MATERIALIZED (
    SELECT posts.id`
  if (sort === 'best') query.append(sql`, posts.votes_score_sort`)
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
  const postTypeFilter = authorAxis ? null : indexServedPostType(options, sort)
  const dataPointFilter = authorAxis ? null : indexServedDataPointFilter(options, sort)
  const globalIdAxis =
    (sort === 'new' || sort === 'relevance' || sort === 'following_new') &&
    !options.community_id &&
    !postTypeFilter &&
    !dataPointFilter
  if (authorAxis) query.append(sql` FROM posts WHERE posts.created_by_id = ${options.user_id}`)
  else if (globalIdAxis) query.append(sql` FROM posts WHERE TRUE`)
  else query.append(sql` FROM posts WHERE posts.deleted_at IS NULL`)
  if (sort === 'hot' || sort === 'trending') query.append(sql` AND posts.votes_score_net > 0`)
  if (options.community_id) query.append(sql` AND posts.community_id = ${options.community_id}`)
  if (postTypeFilter) query.append(postTypeFilter)
  if (dataPointFilter) query.append(dataPointFilter)
  appendSourceEmbeddingGuards(query, options)
  appendCandidateCursor(query, options, sort)
  return query.append(sql` ORDER BY `).append(candidateOrder(sort)).append(sql` LIMIT ${cap + 1}
  )`)
}
