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
 * A keyed per-row probe on the post id. The LATERAL LIMIT 1 keeps each EXISTS a probe: unfenced,
 * an EXISTS inside an OR becomes a hashed SubPlan that reads the topic's whole membership set.
 * `table` is a trusted relation-table constant and `alias` a literal at every call site.
 */
function buildFencedMembershipProbe(
  table: string,
  alias: string,
  postIdColumn: string,
  condition: SQLStatement,
  keyColumn = 'subject_id',
): SQLStatement {
  return sql`EXISTS (
    SELECT 1 FROM LATERAL (
      SELECT 1 FROM `
    .append(`${table} ${alias}\n      WHERE ${alias}.${keyColumn} = ${postIdColumn} AND `)
    .append(condition)
    .append(`\n      LIMIT 1\n    ) ${alias}_probe\n  )`)
}

/** A direct category relation, or a linked hashtag alias, probed by the post id. */
function keyedTopicAttachmentExists(postIdColumn: string, topicId: string): SQLStatement {
  return buildFencedMembershipProbe(
    POST_TOPIC_CATEGORY_RELATION_TABLE,
    'direct_relation',
    postIdColumn,
    sql`direct_relation.object_id = ${topicId}
        AND direct_relation.deleted_at IS NULL AND direct_relation.votes_score_net > 0`,
  )
    .append(sql` OR `)
    .append(
      buildFencedMembershipProbe(
        POST_TOPIC_ALIAS_CATEGORY_RELATION_TABLE,
        'alias_relation',
        postIdColumn,
        sql`alias_relation.object_id = ANY (ARRAY(
          SELECT alias.id FROM topic_aliases alias WHERE alias.topic_id = ${topicId}
        ))
        AND alias_relation.deleted_at IS NULL AND alias_relation.votes_score_net > 0`,
      ),
    )
}

/**
 * Search hashtag topic membership: is the post at `postIdColumn` positively attached to `topicId`,
 * directly or through one of its aliases? `postIdColumn` must be a qualified `table.column`
 * identifier. A per-row keyed probe, never a topic-side `IN (SELECT post_id ...)` pool.
 */
export function keyedTopicMembershipExists(postIdColumn: string, topicId: string): SQLStatement {
  assertSafePostIdColumn(postIdColumn)
  return sql`(`.append(keyedTopicAttachmentExists(postIdColumn, topicId)).append(sql`)`)
}

/** A keyed check across direct relations, linked aliases, review ratings and data-point topics. */
export function keyedUniversalTopicMembershipExists(
  postIdColumn: string,
  topicId: string,
): SQLStatement {
  assertSafePostIdColumn(postIdColumn)
  return sql`(`
    .append(keyedTopicAttachmentExists(postIdColumn, topicId))
    .append(sql` OR `)
    .append(
      buildFencedMembershipProbe(
        'post_review_topic_ratings',
        'rating',
        postIdColumn,
        sql`rating.topic_id = ${topicId}`,
        'post_id',
      ),
    )
    .append(sql` OR `)
    .append(
      buildFencedMembershipProbe(
        'post_data_point_topics',
        'data_point',
        postIdColumn,
        sql`data_point.topic_id = ${topicId}`,
        'post_id',
      ),
    )
    .append(sql`)`)
}

/** A keyed check for one exact hashtag alias, even when it has no linked topic. */
export function keyedTopicAliasMembershipExists(
  postIdColumn: string,
  aliasId: string,
): SQLStatement {
  assertSafePostIdColumn(postIdColumn)
  return buildFencedMembershipProbe(
    POST_TOPIC_ALIAS_CATEGORY_RELATION_TABLE,
    'relation',
    postIdColumn,
    sql`relation.object_id = ${aliasId}
      AND relation.deleted_at IS NULL AND relation.votes_score_net > 0`,
  )
}
