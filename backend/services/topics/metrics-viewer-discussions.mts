import sql, { type SQLStatement } from 'sql-template-strings'

/** A first/next seek keeps each raw index read bounded even when a topic has many matches. */
export function buildTopicViewerDiscussionInputs(topicId: string, inputCap: number): SQLStatement {
  return sql`viewer_alias_inputs AS MATERIALIZED (
    WITH RECURSIVE viewer_alias_key_walk AS (
      (SELECT alias.id, alias.alias, 1 AS inspected FROM topic_aliases alias
       WHERE alias.topic_id IS NOT NULL AND alias.topic_id = ${topicId}
       ORDER BY alias.topic_id, alias.alias LIMIT 1)
      UNION ALL
      SELECT next_alias.id, next_alias.alias, walk.inspected + 1
      FROM viewer_alias_key_walk walk CROSS JOIN LATERAL (
        SELECT alias.id, alias.alias FROM topic_aliases alias
        WHERE alias.topic_id IS NOT NULL AND alias.topic_id = ${topicId}
          AND alias.alias > walk.alias
        ORDER BY alias.topic_id, alias.alias LIMIT 1
      ) next_alias WHERE walk.inspected < ${inputCap}
    )
    SELECT id FROM viewer_alias_key_walk LIMIT ${inputCap}
  ), viewer_direct_inputs AS MATERIALIZED (`
    .append(
      boundedMembershipWalk(
        'relation__post__category__topic',
        sql`${topicId}::uuid`,
        inputCap,
        'viewer_direct_key_walk',
      ),
    )
    .append(sql`), viewer_alias_relation_inputs AS MATERIALIZED (
      SELECT alias_posts.post_id FROM viewer_alias_inputs alias CROSS JOIN LATERAL (`)
    .append(
      boundedMembershipWalk(
        'relation__post__category__topic_alias',
        sql`alias.id`,
        inputCap,
        'viewer_alias_relation_key_walk',
      ),
    ).append(sql`) alias_posts LIMIT ${inputCap}
    )`)
}

function boundedMembershipWalk(
  table: 'relation__post__category__topic' | 'relation__post__category__topic_alias',
  objectId: SQLStatement,
  inputCap: number,
  walk: 'viewer_direct_key_walk' | 'viewer_alias_relation_key_walk',
): SQLStatement {
  const first = membershipSeek(table, objectId)
  const next = membershipSeek(table, objectId, sql``.append(`${walk}.post_id`))
  return sql`WITH RECURSIVE `
    .append(walk)
    .append(sql` AS (
    (SELECT first_post.post_id, 1 AS inspected FROM (`)
    .append(first)
    .append(sql`) first_post)
    UNION ALL
    SELECT next_post.post_id, `)
    .append(`${walk}.inspected + 1`)
    .append(sql` FROM `)
    .append(walk)
    .append(sql` CROSS JOIN LATERAL (`)
    .append(next)
    .append(sql`) next_post WHERE `)
    .append(`${walk}.inspected`)
    .append(sql` < ${inputCap}
  ) SELECT post_id FROM `)
    .append(walk)
    .append(sql` LIMIT ${inputCap}`)
}

function membershipSeek(
  table: 'relation__post__category__topic' | 'relation__post__category__topic_alias',
  objectId: SQLStatement,
  after?: SQLStatement,
): SQLStatement {
  const object = sql`(CASE WHEN relation.deleted_at IS NULL AND relation.votes_score_net > 0
    THEN relation.object_id END)`
  const query = sql`SELECT relation.subject_id AS post_id FROM `
    .append(table)
    .append(sql` relation
    WHERE `)
    .append(object)
    .append(sql` = `)
    .append(objectId)
    .append(sql` AND relation.deleted_at IS NULL AND relation.votes_score_net > 0`)
  if (after) query.append(sql` AND relation.subject_id > `).append(after)
  return query
    .append(sql` ORDER BY `)
    .append(object)
    .append(sql`, relation.subject_id LIMIT 1`)
}

/** Deduplicate only after the independently bounded raw streams and keyed viewer checks. */
export function buildTopicViewerDiscussionCount(
  probeLimit: number,
  eligibility: SQLStatement,
): SQLStatement {
  return sql`SELECT COUNT(*)::bigint FROM (
    SELECT DISTINCT input.post_id FROM (
      SELECT post_id FROM viewer_direct_inputs UNION ALL
      SELECT post_id FROM viewer_alias_relation_inputs
    ) input WHERE EXISTS (
      SELECT 1 FROM LATERAL (
        SELECT 1 FROM posts candidate_post
        JOIN posts root_post ON root_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)
        WHERE candidate_post.id = input.post_id AND candidate_post.post_type = 'discussion' AND `.append(
    eligibility,
  ).append(sql` LIMIT 1
      ) eligible_discussion
    ) LIMIT ${probeLimit}
  ) counted_posts`)
}
