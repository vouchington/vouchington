import sql, { type SQLStatement } from 'sql-template-strings'
import {
  POST_TOPIC_ALIAS_CATEGORY_RELATION_TABLE,
  POST_TOPIC_CATEGORY_RELATION_TABLE,
} from '@voucha/types/entities/entity-relation-tables'

const POST_ID_COLUMN_PATTERN = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/i

function assertSafePostIdColumn(postIdColumn: string): void {
  if (!POST_ID_COLUMN_PATTERN.test(postIdColumn)) {
    throw new Error(`Invalid postIdColumn format: ${postIdColumn}`)
  }
}

/**
 * Single-topic candidate `post_id` derivation: every post positively attached to `topicId`,
 * directly or through one of its hashtag aliases. Meant for a `FROM (…) candidate` subselect —
 * candidate-binding from this indexed topic side (instead of a per-row correlated `EXISTS`) lets
 * the planner drive the query from the topic's relation rows.
 */
export function buildTopicPostCandidateSelect(topicId: string): SQLStatement {
  return sql`
    SELECT rel.subject_id AS post_id
    FROM `
    .append(POST_TOPIC_CATEGORY_RELATION_TABLE)
    .append(sql` rel
    WHERE (CASE WHEN rel.deleted_at IS NULL AND rel.votes_score_net > 0 THEN rel.object_id END) = ${topicId}
      AND rel.deleted_at IS NULL
      AND rel.votes_score_net > 0

    UNION ALL

    SELECT alias_relation.subject_id AS post_id
    FROM topic_aliases alias
    JOIN `)
    .append(POST_TOPIC_ALIAS_CATEGORY_RELATION_TABLE).append(sql` alias_relation
      ON (CASE WHEN alias_relation.deleted_at IS NULL AND alias_relation.votes_score_net > 0 THEN alias_relation.object_id END) = alias.id
     AND alias_relation.deleted_at IS NULL
     AND alias_relation.votes_score_net > 0
    WHERE alias.topic_id = ${topicId}
  `)
}

/**
 * Single-topic membership test: is the post at `postIdColumn` positively attached to `topicId`,
 * directly or through one of its hashtag aliases? `postIdColumn` must be a qualified
 * `table.column` identifier (e.g. `posts.id`, `eligible_posts.id`) — every call site joins at
 * least one other `posts`-aliased table, so a bare column would be ambiguous at runtime.
 *
 * Uses a candidate-bind `IN (SELECT candidate.post_id FROM (…) candidate)` shape built from
 * `buildTopicPostCandidateSelect`, rather than a correlated `EXISTS (… UNION ALL …)`: Postgres
 * cannot pull a `UNION ALL` body into a semijoin, so that shape materialized the candidate set
 * once per outer row. A correlated `OR EXISTS` also let topic discussion counts start at `posts`
 * and filter by `post_type`, which misses the topic-viewer row cap.
 */
export function buildTopicMembershipExists(postIdColumn: string, topicId: string): SQLStatement {
  assertSafePostIdColumn(postIdColumn)
  return sql``
    .append(postIdColumn)
    .append(sql` IN (
      SELECT candidate.post_id
      FROM (`)
    .append(buildTopicPostCandidateSelect(topicId)).append(sql`) candidate
    )`)
}

/** A keyed check across direct relations, linked aliases, review ratings and data-point topics. */
export function buildUniversalTopicMembershipExists(
  postIdColumn: string,
  topicId: string,
): SQLStatement {
  assertSafePostIdColumn(postIdColumn)
  return sql`(`
    .append(buildTopicMembershipExists(postIdColumn, topicId))
    .append(sql` OR EXISTS (
      SELECT 1 FROM post_review_topic_ratings rating
      WHERE rating.post_id = `)
    .append(postIdColumn)
    .append(sql` AND rating.topic_id = ${topicId}
    ) OR EXISTS (
      SELECT 1 FROM post_data_point_topics data_point
      WHERE data_point.post_id = `)
    .append(postIdColumn).append(sql` AND data_point.topic_id = ${topicId}
    ))`)
}

/** A keyed check for one exact hashtag alias, even when it has no linked topic. */
export function buildTopicAliasMembershipExists(
  postIdColumn: string,
  aliasId: string,
): SQLStatement {
  assertSafePostIdColumn(postIdColumn)
  return sql`EXISTS (
    SELECT 1 FROM `
    .append(POST_TOPIC_ALIAS_CATEGORY_RELATION_TABLE)
    .append(sql` relation
    WHERE relation.subject_id = `)
    .append(postIdColumn).append(sql` AND relation.object_id = ${aliasId}
      AND relation.deleted_at IS NULL AND relation.votes_score_net > 0
  )`)
}
