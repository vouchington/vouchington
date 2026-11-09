import sql, { type SQLStatement } from 'sql-template-strings'
import type { PostSearchOptions, PostSearchSort } from '../types.mts'
import { postsWorkMaxValues } from '../../work-limits.mts'

/** A checked numeric SQL literal lets generic plans cost the finite raw index walk. */
export function candidateLimitLiteral(limit: number): string {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > postsWorkMaxValues.post_search_filter_candidate_limit + 1
  )
    throw new Error('Invalid bounded post candidate limit')
  return String(limit)
}

/** An absent similarity source makes the candidate page conclusively empty. */
export function appendSourceEmbeddingGuards(query: SQLStatement, options: PostSearchOptions): void {
  if (options.similar_post_id) query.append(sql` AND EXISTS (SELECT 1 FROM similar_post_embedding)`)
  if (options.similar_topic_id)
    query.append(sql` AND EXISTS (SELECT 1 FROM similar_topic_embedding)`)
  if (options.similar_rss_feed_item_id)
    query.append(sql` AND EXISTS (SELECT 1 FROM similar_rss_feed_item_embedding)`)
}

export function buildDataPointTopicRawCandidates(
  topicId: string,
  cap: number,
  options: PostSearchOptions,
  topicBestCohort: boolean,
): SQLStatement {
  const query = sql`raw_post_search_candidates AS MATERIALIZED (
    SELECT topic_post.post_id AS id
    FROM post_data_point_topics topic_post
    WHERE topic_post.topic_id = ${topicId}`
  if (topicBestCohort && options.cohort_hi && options.cohort_lo)
    query.append(sql` AND topic_post.post_id <= ${options.cohort_hi}
      AND topic_post.post_id >= ${options.cohort_lo}`)
  else if (topicBestCohort && options.cohort_before_id)
    query.append(sql` AND topic_post.post_id < ${options.cohort_before_id}`)
  else if (options.id_lt) query.append(sql` AND topic_post.post_id < ${options.id_lt}`)
  appendSourceEmbeddingGuards(query, options)
  return query
    .append(sql` ORDER BY topic_post.post_id DESC LIMIT `)
    .append(candidateLimitLiteral(cap + 1)).append(sql`
  )`)
}

export function indexServedDataPointFilter(
  options: PostSearchOptions,
  sort: PostSearchSort,
): SQLStatement | null {
  if (sort !== 'new' && sort !== 'best') return null
  if (options.community_id) return null
  if (options.post_types?.length !== 1 || options.post_types[0] !== 'data_point') return null
  if (options.data_point_vertical)
    return sql` AND posts.data_point_vertical IS NOT NULL
      AND posts.data_point_vertical = ${options.data_point_vertical}`
  if (options.data_point_result)
    return sql` AND posts.structured_data IS NOT NULL
      AND posts.structured_data->>'result' = ${options.data_point_result}`
  // The credit-range best index is cheaper as a bitmap scan over every match on the
  // seeded corpus. Walk the post-type score index first and apply credit range after
  // the bounded prefix; the inspected-key cursor reaches older matches on later pages.
  if (options.data_point_credit_score_range && sort === 'new')
    return sql` AND posts.structured_data IS NOT NULL
      AND posts.structured_data->>'credit_score_range' = ${options.data_point_credit_score_range}`
  return null
}

export function indexServedPostType(
  options: PostSearchOptions,
  sort: PostSearchSort,
): SQLStatement | null {
  if (options.community_id) return null
  if (options.post_types?.length === 1) {
    const postType = options.post_types[0]
    if (sort === 'hot' || sort === 'trending') return sql` AND posts.post_type = ${postType}`
    if (postType === 'topic_recommendation')
      return sql` AND posts.post_type = 'topic_recommendation'`
    if (postType === 'data_point') return sql` AND posts.post_type = 'data_point'`
    if (postType === 'story') return sql` AND posts.post_type = 'story'`
    return null
  }
  return !options.post_types?.length && isRecommendationScope(options)
    ? sql` AND posts.post_type = 'topic_recommendation'`
    : null
}

function isRecommendationScope(options: PostSearchOptions): boolean {
  return (
    options.post_types?.includes('topic_recommendation') === true ||
    options.topic_recommendation_status !== undefined ||
    Boolean(options.topic_recommendation_q?.trim())
  )
}
