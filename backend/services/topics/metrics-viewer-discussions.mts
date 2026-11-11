import sql, { type SQLStatement } from 'sql-template-strings'

/** Count distinct eligible identities, stopping each topic/alias index walk at the probe. */
export function buildTopicViewerDiscussionCount(
  topicId: string,
  probeLimit: number,
  eligibility: SQLStatement,
): SQLStatement {
  return sql`SELECT COUNT(*)::bigint FROM (
    (
      SELECT relation.subject_id AS post_id
      FROM relation__post__category__topic relation
      WHERE (CASE WHEN relation.deleted_at IS NULL AND relation.votes_score_net > 0
        THEN relation.object_id END) = ${topicId}
        AND relation.deleted_at IS NULL AND relation.votes_score_net > 0
        AND `
    .append(eligibleDiscussionExists(sql`relation.subject_id`, eligibility))
    .append(sql`
      ORDER BY relation.subject_id
      LIMIT ${probeLimit}
    )
    UNION
    (
      SELECT DISTINCT alias_posts.post_id
      FROM topic_aliases alias
      JOIN LATERAL (
        SELECT alias_relation.subject_id AS post_id
        FROM relation__post__category__topic_alias alias_relation
        WHERE (CASE WHEN alias_relation.deleted_at IS NULL AND alias_relation.votes_score_net > 0
          THEN alias_relation.object_id END) = alias.id
          AND alias_relation.deleted_at IS NULL AND alias_relation.votes_score_net > 0
          AND `)
    .append(eligibleDiscussionExists(sql`alias_relation.subject_id`, eligibility)).append(sql`
        ORDER BY alias_relation.subject_id
        LIMIT ${probeLimit}
      ) alias_posts ON TRUE
      WHERE alias.topic_id = ${topicId}
      ORDER BY alias_posts.post_id
      LIMIT ${probeLimit}
    )
    LIMIT ${probeLimit}
  ) counted_posts`)
}

function eligibleDiscussionExists(postId: SQLStatement, eligibility: SQLStatement): SQLStatement {
  return sql`EXISTS (
    SELECT 1 FROM LATERAL (
      SELECT 1 FROM posts candidate_post
      JOIN posts root_post ON root_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)
      WHERE candidate_post.id = `
    .append(postId)
    .append(sql` AND candidate_post.post_type = 'discussion' AND `)
    .append(eligibility).append(sql` LIMIT 1
    ) eligible_discussion
  )`)
}
