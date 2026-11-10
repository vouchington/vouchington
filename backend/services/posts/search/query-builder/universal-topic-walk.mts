import sql, { type SQLStatement } from 'sql-template-strings'
import {
  POST_TOPIC_ALIAS_CATEGORY_RELATION_TABLE,
  POST_TOPIC_CATEGORY_RELATION_TABLE,
} from '@voucha/types/entities/entity-relation-tables'

/**
 * Newest universal-topic page: each attachment index is already ordered by post id.
 * The outer LIMIT stops the merge, then posts are fetched by primary key.
 */
export function appendUniversalTopicNewestSource(
  query: SQLStatement,
  topicIds: readonly string[],
  idLt?: string,
): void {
  const topicId = [...new Set(topicIds)][0]
  if (!topicId) return
  query.append(sql`
    FROM (
      (`)
  appendDirectMembers(query, topicId, idLt)
  query.append(sql`)
      UNION ALL
      (`)
  appendAliasMembers(query, topicId, idLt)
  query.append(sql`)
      UNION ALL
      (`)
  appendReviewMembers(query, topicId, idLt)
  query.append(sql`)
      UNION ALL
      (`)
  appendDataPointMembers(query, topicId, idLt)
  query.append(sql`)
    ) topic_member
    JOIN posts ON posts.id = topic_member.post_id
  `)
}

function appendDirectMembers(query: SQLStatement, topicId: string, idLt?: string): void {
  query.append(
    sql`
          SELECT rel.subject_id AS post_id
          FROM `.append(POST_TOPIC_CATEGORY_RELATION_TABLE).append(sql` rel
          WHERE (CASE WHEN rel.deleted_at IS NULL AND rel.votes_score_net > 0 THEN rel.object_id END) = ${topicId}
            AND rel.deleted_at IS NULL
            AND rel.votes_score_net > 0`),
  )
  appendIdUpperBound(query, 'rel.subject_id', idLt)
  query.append(sql`
          ORDER BY rel.subject_id DESC`)
}

function appendAliasMembers(query: SQLStatement, topicId: string, idLt?: string): void {
  // subject_id order lets one alias index stop at LIMIT. A topic with few aliases can nested-loop the positive object index instead.
  query.append(
    sql`
          SELECT alias_relation.subject_id AS post_id
          FROM `.append(POST_TOPIC_ALIAS_CATEGORY_RELATION_TABLE).append(sql` alias_relation
          JOIN topic_aliases alias
            ON alias.id = alias_relation.object_id
           AND (CASE WHEN alias_relation.deleted_at IS NULL AND alias_relation.votes_score_net > 0 THEN alias_relation.object_id END) = alias.id
          WHERE alias.topic_id = ${topicId}
            AND alias_relation.deleted_at IS NULL
            AND alias_relation.votes_score_net > 0`),
  )
  appendIdUpperBound(query, 'alias_relation.subject_id', idLt)
  query.append(sql`
          ORDER BY alias_relation.subject_id DESC`)
}

function appendReviewMembers(query: SQLStatement, topicId: string, idLt?: string): void {
  query.append(sql`
          SELECT rating.post_id
          FROM post_review_topic_ratings rating
          WHERE rating.topic_id = ${topicId}`)
  appendIdUpperBound(query, 'rating.post_id', idLt)
  query.append(sql`
          ORDER BY rating.post_id DESC`)
}

function appendDataPointMembers(query: SQLStatement, topicId: string, idLt?: string): void {
  query.append(sql`
          SELECT data_point.post_id
          FROM post_data_point_topics data_point
          WHERE data_point.topic_id = ${topicId}`)
  appendIdUpperBound(query, 'data_point.post_id', idLt)
  query.append(sql`
          ORDER BY data_point.post_id DESC`)
}

function appendIdUpperBound(query: SQLStatement, column: string, idLt?: string): void {
  if (!idLt) return
  query
    .append(sql` AND `)
    .append(column)
    .append(sql` < ${idLt}`)
}
