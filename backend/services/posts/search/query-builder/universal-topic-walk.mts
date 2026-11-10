import sql, { type SQLStatement } from 'sql-template-strings'
import {
  POST_TOPIC_ALIAS_CATEGORY_RELATION_TABLE,
  POST_TOPIC_CATEGORY_RELATION_TABLE,
} from '@voucha/types/entities/entity-relation-tables'

/**
 * Newest universal-topic page. Each arm stops at the page on its own sort key.
 * Alias membership starts at the topic's aliases, then probes the positive-object index.
 */
export function appendUniversalTopicNewestSource(
  query: SQLStatement,
  topicIds: readonly string[],
  idLt?: string,
  limit = 100,
): void {
  const topicId = [...new Set(topicIds)][0]
  if (!topicId) return
  query.append(sql`
    FROM (
      SELECT DISTINCT post_id
      FROM (
        (`)
  appendDirectMembers(query, topicId, idLt, limit)
  query.append(sql`)
        UNION ALL
        (`)
  appendAliasMembers(query, topicId, idLt, limit)
  query.append(sql`)
        UNION ALL
        (`)
  appendReviewMembers(query, topicId, idLt, limit)
  query.append(sql`)
        UNION ALL
        (`)
  appendDataPointMembers(query, topicId, idLt, limit)
  query.append(sql`)
      ) topic_source
    ) topic_member
    JOIN posts ON posts.id = topic_member.post_id
  `)
}

function appendDirectMembers(
  query: SQLStatement,
  topicId: string,
  idLt: string | undefined,
  limit: number,
): void {
  query.append(
    sql`
          SELECT rel.subject_id AS post_id
          FROM `.append(POST_TOPIC_CATEGORY_RELATION_TABLE).append(sql` rel
          WHERE (CASE WHEN rel.deleted_at IS NULL AND rel.votes_score_net > 0 THEN rel.object_id END) = ${topicId}
            AND rel.deleted_at IS NULL
            AND rel.votes_score_net > 0`),
  )
  appendOrderedPage(query, 'rel.subject_id', idLt, limit)
}

function appendAliasMembers(
  query: SQLStatement,
  topicId: string,
  idLt: string | undefined,
  limit: number,
): void {
  query.append(sql`
          SELECT member.post_id
          FROM (
            SELECT alias.id
            FROM topic_aliases alias
            WHERE alias.topic_id = ${topicId}
          ) alias
          CROSS JOIN LATERAL (
            SELECT alias_relation.subject_id AS post_id
            FROM `)
  query.append(POST_TOPIC_ALIAS_CATEGORY_RELATION_TABLE).append(sql` alias_relation
            WHERE (CASE WHEN alias_relation.deleted_at IS NULL AND alias_relation.votes_score_net > 0 THEN alias_relation.object_id END) = alias.id
              AND alias_relation.deleted_at IS NULL
              AND alias_relation.votes_score_net > 0`)
  appendIdUpperBound(query, 'alias_relation.subject_id', idLt)
  query.append(sql`
            ORDER BY alias_relation.subject_id DESC
            LIMIT ${limit}
          ) member
          ORDER BY member.post_id DESC
          LIMIT ${limit}`)
}

function appendReviewMembers(
  query: SQLStatement,
  topicId: string,
  idLt: string | undefined,
  limit: number,
): void {
  query.append(sql`
          SELECT rating.post_id
          FROM post_review_topic_ratings rating
          WHERE rating.topic_id = ${topicId}`)
  appendOrderedPage(query, 'rating.post_id', idLt, limit)
}

function appendDataPointMembers(
  query: SQLStatement,
  topicId: string,
  idLt: string | undefined,
  limit: number,
): void {
  query.append(sql`
          SELECT data_point.post_id
          FROM post_data_point_topics data_point
          WHERE data_point.topic_id = ${topicId}`)
  appendOrderedPage(query, 'data_point.post_id', idLt, limit)
}

function appendOrderedPage(
  query: SQLStatement,
  column: string,
  idLt: string | undefined,
  limit: number,
): void {
  appendIdUpperBound(query, column, idLt)
  query.append(sql`
          ORDER BY `)
  query.append(column)
  query.append(sql` DESC
          LIMIT ${limit}`)
}

function appendIdUpperBound(query: SQLStatement, column: string, idLt?: string): void {
  if (!idLt) return
  query
    .append(sql` AND `)
    .append(column)
    .append(sql` < ${idLt}`)
}
