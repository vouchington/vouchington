import sql, { type SQLStatement } from 'sql-template-strings'
import {
  buildTopicMembershipExists,
  buildTopicAliasMembershipExists,
  buildUniversalTopicPostCandidatePairsSelect,
} from '@modules/feed-query-builders'
import type { PostSearchOptions } from '../types.mts'
import { POST_TOPIC_CATEGORY_RELATION_TABLE } from '@services/entity-relations/metadata'

export function appendTopicFilters(
  filters: SQLStatement[],
  {
    data_point_topic_ids,
    hashtag_alias_ids,
    hashtag_topic_ids,
    related_topic_ids,
    review_topic_ids,
    universal_topic_ids,
    url_id,
  }: PostSearchOptions,
): void {
  if (url_id) appendUrlFilter(filters)
  if (related_topic_ids?.length) appendRelatedTopicFilters(filters, related_topic_ids)
  if (hashtag_topic_ids?.length) appendHashtagTopicFilters(filters, hashtag_topic_ids)
  if (hashtag_alias_ids?.length) appendHashtagAliasFilters(filters, hashtag_alias_ids)
  if (review_topic_ids?.length) appendReviewTopicFilters(filters, review_topic_ids)
  if (data_point_topic_ids?.length) appendDataPointTopicFilters(filters, data_point_topic_ids)
  if (universal_topic_ids?.length) appendUniversalTopicFilters(filters, universal_topic_ids)
}

function appendHashtagTopicFilters(filters: SQLStatement[], topicIds: string[]): void {
  for (const topicId of [...new Set(topicIds)]) {
    filters.push(buildTopicMembershipExists('posts.id', topicId))
  }
}

function appendHashtagAliasFilters(filters: SQLStatement[], aliasIds: string[]): void {
  for (const aliasId of [...new Set(aliasIds)]) {
    filters.push(buildTopicAliasMembershipExists('posts.id', aliasId))
  }
}

function appendUrlFilter(filters: SQLStatement[]): void {
  filters.push(sql`EXISTS (
      SELECT 1
      FROM relation__post__related__url
      JOIN canonical_urls ON canonical_urls.id = relation__post__related__url.object_id
      WHERE relation__post__related__url.subject_id = posts.id
        AND relation__post__related__url.deleted_at IS NULL
        AND relation__post__related__url.votes_score_net > 0
    )`)
}

function appendRelatedTopicFilters(filters: SQLStatement[], topicIds: string[]): void {
  topicIds.forEach(topicId => {
    filters.push(
      sql`EXISTS (
        SELECT 1
        FROM `.append(POST_TOPIC_CATEGORY_RELATION_TABLE).append(sql` AS post_topic_categories
        WHERE post_topic_categories.subject_id = posts.id
          AND post_topic_categories.object_id = ${topicId}
          AND post_topic_categories.deleted_at IS NULL
          AND post_topic_categories.votes_score_net > 0
      )`),
    )
  })
}

function appendReviewTopicFilters(filters: SQLStatement[], topicIds: string[]): void {
  filters.push(sql`posts.post_type = 'review'`)
  topicIds.forEach(topicId => {
    filters.push(sql`EXISTS (
        SELECT 1 FROM post_review_topic_ratings
        WHERE post_review_topic_ratings.post_id = posts.id
          AND post_review_topic_ratings.topic_id = ${topicId}
      )`)
  })
}

function appendDataPointTopicFilters(filters: SQLStatement[], topicIds: string[]): void {
  filters.push(sql`posts.post_type = 'data_point'`)
  topicIds.forEach(topicId => {
    filters.push(sql`EXISTS (
        SELECT 1 FROM post_data_point_topics
        WHERE post_data_point_topics.post_id = posts.id
          AND post_data_point_topics.topic_id = ${topicId}
      )`)
  })
}

function appendUniversalTopicFilters(filters: SQLStatement[], topicIds: string[]): void {
  const uniqueTopicIds = [...new Set(topicIds)]
  if (uniqueTopicIds.length === 0) return
  filters.push(
    sql`posts.id IN (
      SELECT universal_topic_candidates.post_id
      FROM (`.append(buildUniversalTopicPostCandidatePairsSelect(uniqueTopicIds))
      .append(sql`) universal_topic_candidates
      GROUP BY universal_topic_candidates.post_id
      HAVING COUNT(*) = ${uniqueTopicIds.length}
    )`),
  )
}
