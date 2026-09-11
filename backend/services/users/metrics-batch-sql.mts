export const USER_METRICS_BATCH_SQL = `/* getUserMetricsByAnyBatch */
    WITH id_input AS (
      SELECT unnest($1::uuid[]) AS input_value,
             unnest($2::int[]) AS input_order
    ),
    username_input AS (
      SELECT unnest($3::text[]) AS input_value,
             unnest($4::int[]) AS input_order
    ),
    id_lookups AS (
      SELECT u.id, id_input.input_order
      FROM users u
      JOIN id_input ON u.id = id_input.input_value
      WHERE u.deleted_at IS NULL
    ),
    username_lookups AS (
      SELECT u.id, username_input.input_order
      FROM users u
      JOIN username_input ON LOWER(u.username) = username_input.input_value
      WHERE u.deleted_at IS NULL
    ),
    combined_ids AS (
      SELECT id, input_order FROM id_lookups
      UNION
      SELECT id, input_order FROM username_lookups
    ),
    post_counts AS (
      SELECT
        posts.created_by_id AS user_id,
        COUNT(*) FILTER (WHERE posts.post_type = 'review')::INT AS reviews_count,
        COUNT(*) FILTER (WHERE posts.post_type = 'discussion')::INT AS discussions_count,
        COUNT(*) FILTER (WHERE posts.post_type = 'comment')::INT AS comments_count
      FROM posts
      JOIN view_public_post_eligibility eligibility ON eligibility.post_id = posts.id
      WHERE posts.created_by_id IN (SELECT id FROM combined_ids)
        AND posts.is_anonymous IS NOT TRUE
        AND (
          posts.openai_omni_moderation_flagged IS NOT TRUE
          OR posts.openai_omni_moderation_created_at IS NULL
        )
      GROUP BY posts.created_by_id
    ),
    topic_follow_counts AS (
      SELECT
        subject_id AS user_id,
        COUNT(*)::INT AS topics_following_count
      FROM relation__user__follow__topic
      WHERE deleted_at IS NULL
        AND subject_id IN (SELECT id FROM combined_ids)
      GROUP BY subject_id
    ),
    user_following_counts AS (
      SELECT
        subject_id AS user_id,
        COUNT(*)::INT AS users_following_count
      FROM relation__user__follow__user
      WHERE deleted_at IS NULL
        AND subject_id IN (SELECT id FROM combined_ids)
      GROUP BY subject_id
    ),
    user_follower_counts AS (
      SELECT
        object_id AS user_id,
        COUNT(*)::INT AS users_followers_count
      FROM relation__user__follow__user
      WHERE deleted_at IS NULL
        AND object_id IN (SELECT id FROM combined_ids)
      GROUP BY object_id
    ),
    rss_feed_counts AS (
      SELECT
        subject_id AS user_id,
        COUNT(*)::INT AS rss_feeds_following_count
      FROM relation__user__follow__rss_feed
      WHERE deleted_at IS NULL
        AND subject_id IN (SELECT id FROM combined_ids)
      GROUP BY subject_id
    ),
    communities_member_counts AS (
      SELECT
        cm.user_id,
        COUNT(*)::INT AS communities_member_count
      FROM community_members cm
      INNER JOIN users u ON u.id = cm.user_id AND u.deleted_at IS NULL
      INNER JOIN communities c ON c.id = cm.community_id AND c.deleted_at IS NULL
      WHERE cm.removed_at IS NULL
        AND u.community_memberships_visibility = 'everyone'
        AND c.visibility = 'public'
        AND (cm.role IN ('owner', 'moderator') OR c.member_roster_visibility = 'public')
        AND cm.user_id IN (SELECT id FROM combined_ids)
      GROUP BY cm.user_id
    )
    SELECT
      combined_ids.input_order,
      vum.*,
      COALESCE(post_counts.reviews_count, 0) AS reviews_count,
      COALESCE(post_counts.discussions_count, 0) AS discussions_count,
      COALESCE(post_counts.comments_count, 0) AS comments_count,
      COALESCE(topic_follow_counts.topics_following_count, 0) AS topics_following_count,
      COALESCE(user_following_counts.users_following_count, 0) AS users_following_count,
      COALESCE(user_follower_counts.users_followers_count, 0) AS users_followers_count,
      COALESCE(rss_feed_counts.rss_feeds_following_count, 0) AS rss_feeds_following_count,
      COALESCE(communities_member_counts.communities_member_count, 0) AS communities_member_count
    FROM combined_ids
    JOIN view_user_metrics vum
      ON vum.id = combined_ids.id
    LEFT JOIN post_counts
      ON post_counts.user_id = combined_ids.id
    LEFT JOIN topic_follow_counts
      ON topic_follow_counts.user_id = combined_ids.id
    LEFT JOIN user_following_counts
      ON user_following_counts.user_id = combined_ids.id
    LEFT JOIN user_follower_counts
      ON user_follower_counts.user_id = combined_ids.id
    LEFT JOIN rss_feed_counts
      ON rss_feed_counts.user_id = combined_ids.id
    LEFT JOIN communities_member_counts
      ON communities_member_counts.user_id = combined_ids.id
    ORDER BY combined_ids.input_order
    `
