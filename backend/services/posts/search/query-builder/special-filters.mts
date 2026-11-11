import { getEntityRelationTableNameOrThrow } from '@services/entity-relations/metadata'
import { isUUID } from '@modules/utils'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { PostSearchOptions } from '../types.mts'
import { buildHotScoreExpression } from '../query-builder-utils.mts'

const MUTED_COMMUNITY_TOPICS = getEntityRelationTableNameOrThrow({
  subjectType: 'community',
  objectType: 'topic',
  predicate: 'mute',
})

/** Filters shared by generic search and the former dedicated post-list queries. */
export function appendPostSearchSpecialFilters(
  filters: SQLStatement[],
  options: PostSearchOptions,
  decisionInstant: Date,
): void {
  if (options.community_id) appendCommunityFilters(filters, options.community_id)
  if (options.exclude_post_ids?.length) {
    filters.push(sql`posts.id <> ALL(${options.exclude_post_ids}::uuid[])`)
  }
  if (options.topic_recommendation_status || options.topic_recommendation_q?.trim()) {
    appendTopicRecommendationFilters(filters, options)
  }
  if (options.trending_topic_id) {
    filters.push(sql`EXISTS (
      SELECT 1 FROM relation__post__category__topic trending_topic
      WHERE trending_topic.subject_id = posts.id
        AND trending_topic.object_id = ${options.trending_topic_id}
        AND trending_topic.deleted_at IS NULL
        AND trending_topic.votes_score_net > 0
    )`)
  }
  // No `display score > 0` filter: votes_score_net > 0 already implies a positive score, and a
  // second predicate on the decayed expression leaves the planner estimating a page below LIMIT,
  // so it sorts the whole window instead of walking the stable-rank index.
  if (options.sort === 'trending' && options.trending_min_score !== undefined) {
    const displayScore = buildHotScoreExpression('posts', decisionInstant)
    filters.push(sql``.append(displayScore).append(sql` >= ${options.trending_min_score}`))
  }
}

function appendCommunityFilters(filters: SQLStatement[], communityId: string): void {
  filters.push(sql`posts.community_id = ${communityId}`)
  filters.push(sql`EXISTS (
    SELECT 1 FROM LATERAL (
      -- post_id is the primary key; keep approval conditions outside this keyed lookup.
      SELECT review.community_id, review.approved_at, review.unpublished_at, review.rejected_at
      FROM community_post_reviews review
      WHERE review.post_id = posts.id
      LIMIT 1
    ) cpr
    WHERE cpr.community_id = ${communityId}
      AND cpr.approved_at IS NOT NULL
      AND cpr.unpublished_at IS NULL
      AND cpr.rejected_at IS NULL
  )`)
  const mutedTopics = sql`NOT EXISTS (
    SELECT 1
    FROM relation__post__category__topic pc
    JOIN `
  mutedTopics.append(MUTED_COMMUNITY_TOPICS).append(sql` mt
      ON mt.object_id = pc.object_id
      AND mt.subject_id = ${communityId}
      AND mt.deleted_at IS NULL
    WHERE pc.subject_id = posts.id
      AND pc.deleted_at IS NULL
      AND pc.votes_score_net > 0
  )`)
  filters.push(mutedTopics)
  const mutedAliases = sql`NOT EXISTS (
    SELECT 1
    FROM relation__post__category__topic_alias post_alias
    JOIN topic_aliases alias ON alias.id = post_alias.object_id
    JOIN `
  mutedAliases.append(MUTED_COMMUNITY_TOPICS).append(sql` mt
      ON mt.object_id = alias.topic_id
      AND mt.subject_id = ${communityId}
      AND mt.deleted_at IS NULL
    WHERE post_alias.subject_id = posts.id
      AND post_alias.deleted_at IS NULL
      AND post_alias.votes_score_net > 0
  )`)
  filters.push(mutedAliases)
}

function appendTopicRecommendationFilters(
  filters: SQLStatement[],
  options: PostSearchOptions,
): void {
  filters.push(sql`posts.post_type = 'topic_recommendation'`)
  const recommendation = sql`EXISTS (
    SELECT 1 FROM LATERAL (
      -- post_id is the partitioned primary key. LIMIT 1 fences this keyed lookup
      -- after the bounded posts page so sparse q/status cannot scan all recommendations.
      SELECT ptr.reviewed_at, ptr.created_topic_id, ptr.topic_title, ptr.topic_slug
      FROM post_topic_recommendations ptr
      WHERE ptr.post_id = posts.id
      LIMIT 1
    ) ptr
    WHERE TRUE`
  if (options.topic_recommendation_status === 'pending') {
    recommendation.append(sql` AND ptr.reviewed_at IS NULL`)
  } else if (options.topic_recommendation_status === 'approved') {
    recommendation.append(
      sql` AND ptr.reviewed_at IS NOT NULL AND ptr.created_topic_id IS NOT NULL`,
    )
  } else if (options.topic_recommendation_status === 'rejected') {
    recommendation.append(sql` AND ptr.reviewed_at IS NOT NULL AND ptr.created_topic_id IS NULL`)
  }
  const query = options.topic_recommendation_q?.trim()
  if (query) {
    const escaped = query.replace(/[%_\\]/g, '\\$&')
    const pattern = `%${escaped}%`
    const text = sql` AND (
      posts.search_vector @@ websearch_to_tsquery('voucha_english', ${query})
      OR ptr.topic_title ILIKE ${pattern} ESCAPE '\\'
      OR ptr.topic_slug ILIKE ${pattern} ESCAPE '\\'`
    if (isUUID(query)) text.append(sql` OR posts.id = ${query}`)
    recommendation.append(text.append(sql`)`))
  }
  filters.push(recommendation.append(sql`)`))
}
