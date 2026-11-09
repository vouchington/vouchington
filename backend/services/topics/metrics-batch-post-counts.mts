export function topicPostCountCtes(): string {
  return `
    discussion_posts AS (
      SELECT requested.id AS topic_id, relation.subject_id AS post_id
      FROM relation__post__category__topic relation
      JOIN requested_topic_ids requested ON requested.id = relation.object_id
      WHERE relation.deleted_at IS NULL AND relation.votes_score_net > 0
      UNION
      SELECT requested.id, alias_relation.subject_id
      FROM relation__post__category__topic_alias alias_relation
      JOIN topic_aliases alias ON alias.id = alias_relation.object_id
      JOIN requested_topic_ids requested ON requested.id = alias.topic_id
      WHERE alias_relation.deleted_at IS NULL AND alias_relation.votes_score_net > 0
    ),
    discussion_counts AS (
      SELECT attached.topic_id, COUNT(*)::bigint AS count
      FROM discussion_posts attached
      WHERE EXISTS (
        SELECT 1 FROM view_public_post_eligibility eligibility
        WHERE eligibility.post_id = attached.post_id AND eligibility.post_type = 'discussion'
      )
      GROUP BY attached.topic_id
    ),
    review_counts AS (
      SELECT rating.topic_id, COUNT(*)::bigint AS count
      FROM post_review_topic_ratings rating
      JOIN requested_topic_ids requested ON requested.id = rating.topic_id
      WHERE EXISTS (
        SELECT 1 FROM view_public_post_eligibility eligibility
        WHERE eligibility.post_id = rating.post_id AND eligibility.post_type = 'review'
      )
      GROUP BY rating.topic_id
    ),
    data_point_counts AS (
      SELECT mapping.topic_id, COUNT(*)::bigint AS count
      FROM post_data_point_topics mapping
      JOIN requested_topic_ids requested ON requested.id = mapping.topic_id
      WHERE EXISTS (
        SELECT 1 FROM view_public_post_eligibility eligibility
        WHERE eligibility.post_id = mapping.post_id AND eligibility.post_type = 'data_point'
      )
      GROUP BY mapping.topic_id
    ),`
}
