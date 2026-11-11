import sql, { type SQLStatement } from 'sql-template-strings'
import {
  keyedTopicAliasMembershipExists,
  keyedTopicMembershipExists,
  keyedUniversalTopicMembershipExists,
} from '@modules/feed-query-builders/topic-membership-probes'
import type { PostSearchOptions } from '../types.mts'
import { POST_TOPIC_CATEGORY_RELATION_TABLE } from '@services/entity-relations/metadata'

export function appendTopicFilters(
  filters: SQLStatement[],
  { data_point_topic_ids, related_topic_ids, review_topic_ids, url_id }: PostSearchOptions,
): void {
  if (url_id) appendUrlFilter(filters)
  if (related_topic_ids?.length) appendRelatedTopicFilters(filters, related_topic_ids)
  if (review_topic_ids?.length) appendReviewTopicFilters(filters, review_topic_ids)
  if (data_point_topic_ids?.length) appendDataPointTopicFilters(filters, data_point_topic_ids)
}

/** True when the options carry hashtag or universal topic membership filters. */
export function hasTopicMembershipFilters({
  hashtag_alias_ids,
  hashtag_topic_ids,
  universal_topic_ids,
}: PostSearchOptions): boolean {
  return Boolean(
    hashtag_alias_ids?.length || hashtag_topic_ids?.length || universal_topic_ids?.length,
  )
}

/** Keyed per-row membership probes on `postIdColumn`: one EXISTS group per topic or alias. */
export function appendTopicMembershipFilters(
  filters: SQLStatement[],
  { hashtag_alias_ids, hashtag_topic_ids, universal_topic_ids }: PostSearchOptions,
  postIdColumn: string,
): void {
  for (const topicId of new Set(hashtag_topic_ids ?? []))
    filters.push(keyedTopicMembershipExists(postIdColumn, topicId))
  for (const aliasId of new Set(hashtag_alias_ids ?? []))
    filters.push(keyedTopicAliasMembershipExists(postIdColumn, aliasId))
  for (const topicId of new Set(universal_topic_ids ?? []))
    filters.push(keyedUniversalTopicMembershipExists(postIdColumn, topicId))
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

const DATA_POINT_TOPIC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function appendDataPointTopicFilters(filters: SQLStatement[], topicIds: string[]): void {
  filters.push(sql`posts.post_type = 'data_point'`)
  for (const topicId of topicIds) filters.push(dataPointTopicExists(topicId))
}

function dataPointTopicExists(topicId: string): SQLStatement {
  const topicIdMatch = DATA_POINT_TOPIC_ID.exec(topicId)
  const query = sql`EXISTS (
        SELECT 1 FROM post_data_point_topics
        WHERE post_data_point_topics.post_id = posts.id
          AND post_data_point_topics.topic_id = `
  if (topicIdMatch) query.append(`'${topicIdMatch[0].toLowerCase()}'::uuid`)
  else query.append(sql`${topicId}`)
  return query.append(')')
}
