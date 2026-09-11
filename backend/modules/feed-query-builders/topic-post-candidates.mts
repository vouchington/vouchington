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
 *
 * Kept textually identical to the `count__discussions` candidate body in
 * `backend/data-stores/psql/views/2025-01-19-topic-metrics.sql` (lines 14-30) — update both
 * together if the shape changes.
 */
export function buildTopicPostCandidateSelect(topicId: string): SQLStatement {
  return sql`
    SELECT rel.subject_id AS post_id
    FROM `
    .append(POST_TOPIC_CATEGORY_RELATION_TABLE)
    .append(sql` rel
    WHERE rel.object_id = ${topicId}
      AND rel.deleted_at IS NULL
      AND rel.votes_score_net > 0

    UNION ALL

    SELECT alias_relation.subject_id AS post_id
    FROM topic_aliases alias
    JOIN `)
    .append(POST_TOPIC_ALIAS_CATEGORY_RELATION_TABLE).append(sql` alias_relation
      ON alias_relation.object_id = alias.id
     AND alias_relation.deleted_at IS NULL
     AND alias_relation.votes_score_net > 0
    WHERE alias.topic_id = ${topicId}
  `)
}

/**
 * Many-topic `(post_id, topic_id)` candidate pairs across all four topic-attachment shapes:
 * direct category relation, hashtag alias relation, review topic ratings, and data-point topics.
 * Meant for a `FROM (…) universal_topic_candidates` subselect; callers group by `post_id` and
 * require `COUNT(*) = topicIds.length` to require every topic, or dedupe for "any of these topics".
 */
export function buildUniversalTopicPostCandidatePairsSelect(topicIds: string[]): SQLStatement {
  return sql`
    SELECT subject_id AS post_id, object_id AS topic_id
    FROM `
    .append(POST_TOPIC_CATEGORY_RELATION_TABLE)
    .append(sql`
    WHERE object_id = ANY(${topicIds})
      AND deleted_at IS NULL
      AND votes_score_net > 0

    UNION

    SELECT relation.subject_id, alias.topic_id
    FROM `)
    .append(POST_TOPIC_ALIAS_CATEGORY_RELATION_TABLE).append(sql` relation
    JOIN topic_aliases alias ON alias.id = relation.object_id
    WHERE relation.deleted_at IS NULL AND relation.votes_score_net > 0
      AND alias.topic_id = ANY(${topicIds})

    UNION

    SELECT post_id, topic_id
    FROM post_review_topic_ratings
    WHERE topic_id = ANY(${topicIds})

    UNION

    SELECT post_id, topic_id
    FROM post_data_point_topics
    WHERE topic_id = ANY(${topicIds})
  `)
}

/**
 * Single-topic membership test: is the post at `postIdColumn` positively attached to `topicId`,
 * directly or through one of its hashtag aliases? `postIdColumn` must be a qualified
 * `table.column` identifier (e.g. `posts.id`, `eligible_posts.id`) — every call site joins at
 * least one other `posts`-aliased table, so a bare column would be ambiguous at runtime.
 *
 * Uses a candidate-bind `IN (SELECT candidate.post_id FROM (…) candidate)` shape built from
 * `buildTopicPostCandidateSelect`, mirroring `appendUniversalTopicFilters`'s pattern, rather than
 * a correlated `EXISTS (… UNION ALL …)`: Postgres cannot pull a `UNION ALL` body into a semijoin,
 * so the old shape materialized the full candidate set once per outer row instead of once per
 * query. The anti-pattern this avoids is `no-mistakes`' `postgres-sql-shape-policy` rule
 * (`correlated-exists-set-operation`, jonathanong/no-mistakes#850, `.no-mistakes.yml`); as of
 * no-mistakes 0.57.1 that rule does not yet trace SQL composed across function boundaries like
 * this one, so it would not have caught the shape this replaces. See #11082.
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

/**
 * Correlated single-alias membership test: is the post at `postIdColumn` positively attached to
 * the hashtag alias `aliasId`? `postIdColumn` must be a qualified `table.column` identifier.
 */
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
