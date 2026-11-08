import sql, { type SQLStatement } from 'sql-template-strings'
import type { PostSearchOptions } from '../types.mts'
import type { CandidateSort } from './bounded-candidate-raw.mts'

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
  idLt: string | undefined,
  cap: number,
  options: PostSearchOptions,
): SQLStatement {
  const query = sql`raw_post_search_candidates AS MATERIALIZED (
    SELECT topic_post.post_id AS id
    FROM post_data_point_topics topic_post
    WHERE topic_post.topic_id = ${topicId}`
  if (idLt) query.append(sql` AND topic_post.post_id < ${idLt}`)
  appendSourceEmbeddingGuards(query, options)
  return query.append(sql` ORDER BY topic_post.post_id DESC LIMIT ${cap + 1}
  )`)
}

export function indexServedDataPointFilter(
  options: PostSearchOptions,
  sort: CandidateSort,
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
  if (options.data_point_credit_score_range)
    return sql` AND posts.structured_data IS NOT NULL
      AND posts.structured_data->>'credit_score_range' = ${options.data_point_credit_score_range}`
  return null
}

export function indexServedPostType(
  options: PostSearchOptions,
  sort: CandidateSort,
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

export function isRecommendationScope(options: PostSearchOptions): boolean {
  return (
    options.post_types?.includes('topic_recommendation') === true ||
    options.topic_recommendation_status !== undefined ||
    Boolean(options.topic_recommendation_q?.trim())
  )
}
