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
      JOIN post_review_topic_ratings rating ON rating.topic_id = requested.id
      UNION ALL
      SELECT 'data_point'::post_types, requested.id, mapping.post_id
      FROM requested_topic_ids requested
      JOIN post_data_point_topics mapping ON mapping.topic_id = requested.id
    ),
    -- Same predicate as view_public_post_eligibility. Pin each post by primary key
    -- before those filters so a topic page does not scan posts.
    eligible_post_counts AS (
      SELECT attached.topic_id, attached.wanted_type, COUNT(DISTINCT attached.post_id)::bigint AS count
      FROM attached_posts attached
      JOIN LATERAL (
        SELECT
          post.id,
          post.post_type,
          post.root_post_id,
          post.created_by_id,
          post.deleted_at,
          post.approved_at,
          post.archived_at
        FROM posts post
        WHERE post.id = attached.post_id
        ORDER BY post.id
        LIMIT 1
      ) candidate_post ON TRUE
      JOIN LATERAL (
        SELECT
          root_post.id,
          root_post.post_type,
          root_post.created_by_id,
          root_post.deleted_at,
          root_post.approved_at,
          root_post.archived_at,
          root_post.privacy,
          root_post.broadcast,
          root_post.community_id
        FROM posts root_post
        WHERE root_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)
        ORDER BY root_post.id
        LIMIT 1
      ) root_post ON TRUE
      WHERE candidate_post.post_type = attached.wanted_type
        AND candidate_post.deleted_at IS NULL
        AND candidate_post.approved_at IS NOT NULL
        AND candidate_post.archived_at IS NULL
        AND root_post.deleted_at IS NULL
        AND root_post.approved_at IS NOT NULL
        AND root_post.archived_at IS NULL
        AND root_post.privacy = 'public'
        AND root_post.broadcast = 'everyone'
        AND NOT EXISTS (
          SELECT 1
          FROM user_suspensions candidate_suspension
          WHERE candidate_suspension.user_id = candidate_post.created_by_id
            AND candidate_suspension.lifted_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1
          FROM user_suspensions root_suspension
          WHERE root_suspension.user_id = root_post.created_by_id
            AND root_suspension.lifted_at IS NULL
        )
        AND (
          root_post.community_id IS NULL
          OR EXISTS (
            WITH publication AS MATERIALIZED (
              SELECT 1
              FROM communities publication_community
              JOIN community_post_reviews publication_review
                ON publication_review.community_id = publication_community.id
               AND publication_review.post_id = root_post.id
               AND publication_review.approved_at IS NOT NULL
               AND publication_review.rejected_at IS NULL
               AND publication_review.unpublished_at IS NULL
              WHERE publication_community.id = root_post.community_id
                AND publication_community.deleted_at IS NULL
                AND publication_community.archived_at IS NULL
                AND publication_community.visibility = 'public'
            )
            SELECT 1 FROM publication
          )
        )
        AND (
          root_post.post_type <> 'story'
          OR EXISTS (
            WITH story_publication AS MATERIALIZED (
              SELECT 1
              FROM story_posts post_story
              JOIN stories publication_story
                ON publication_story.id = post_story.story_id
               AND publication_story.deleted_at IS NULL
              JOIN rss_feed_items story_item
                ON story_item.story_id = publication_story.id
               AND story_item.deleted_at IS NULL
              WHERE post_story.post_id = root_post.id
                AND EXISTS (
                  WITH source_publication AS MATERIALIZED (
                    SELECT 1
                    FROM rss_feed_item_sources story_source
                    JOIN rss_feeds story_feed ON story_feed.id = story_source.rss_feed_id
                    WHERE story_source.rss_feed_item_id = story_item.id
                      AND story_feed.deleted_at IS NULL
                      AND story_feed.is_enabled = TRUE
                      AND story_feed.is_discoverable = TRUE
                  )
                  SELECT 1 FROM source_publication
                )
            )
            SELECT 1 FROM story_publication
          )
        )
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
