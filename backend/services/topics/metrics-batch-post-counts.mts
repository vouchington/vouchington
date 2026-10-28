export function topicPostCountCtes(): string {
  return `
    attached_posts AS (
      SELECT 'discussion'::post_types AS wanted_type, requested.id AS topic_id, relation.subject_id AS post_id
      FROM requested_topic_ids requested
      JOIN relation__post__category__topic relation
        ON relation.object_id = requested.id
       AND relation.deleted_at IS NULL
       AND relation.votes_score_net > 0
      UNION ALL
      SELECT 'discussion'::post_types, requested.id, alias_relation.subject_id
      FROM requested_topic_ids requested
      JOIN topic_aliases alias ON alias.topic_id = requested.id
      JOIN relation__post__category__topic_alias alias_relation
        ON alias_relation.object_id = alias.id
       AND alias_relation.deleted_at IS NULL
       AND alias_relation.votes_score_net > 0
      UNION ALL
      SELECT 'review'::post_types, requested.id, rating.post_id
      FROM requested_topic_ids requested
      JOIN LATERAL (
        SELECT rating.post_id
        FROM post_review_topic_ratings rating
        WHERE rating.topic_id = requested.id
        GROUP BY rating.post_id
      ) rating ON TRUE
      UNION ALL
      SELECT 'data_point'::post_types, requested.id, mapping.post_id
      FROM requested_topic_ids requested
      JOIN LATERAL (
        SELECT mapping.post_id
        FROM post_data_point_topics mapping
        WHERE mapping.topic_id = requested.id
        GROUP BY mapping.post_id
      ) mapping ON TRUE
    ),
    eligible_post_counts AS (
      SELECT attached.topic_id, attached.wanted_type, COUNT(DISTINCT attached.post_id)::bigint AS count
      FROM attached_posts attached
      JOIN LATERAL (
        SELECT eligibility.post_id
        FROM view_public_post_eligibility eligibility
        WHERE eligibility.post_id = attached.post_id
          AND eligibility.post_type = attached.wanted_type
        LIMIT 1
      ) eligible ON TRUE
      GROUP BY attached.topic_id, attached.wanted_type
    ),
    discussion_counts AS (
      SELECT topic_id, count FROM eligible_post_counts WHERE wanted_type = 'discussion'
    ),
    review_counts AS (
      SELECT topic_id, count FROM eligible_post_counts WHERE wanted_type = 'review'
    ),
    data_point_counts AS (
      SELECT topic_id, count FROM eligible_post_counts WHERE wanted_type = 'data_point'
    ),`
}
