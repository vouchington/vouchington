export const USER_METRICS_BATCH_SQL = `
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
    )
    SELECT
      combined_ids.input_order,
      vum.*,
      (SELECT COUNT(*)::INT FROM (
        SELECT 1
        FROM posts
        JOIN view_public_post_eligibility eligibility ON eligibility.post_id = posts.id
        WHERE posts.created_by_id = combined_ids.id
          AND posts.post_type = 'review'
          AND posts.is_anonymous IS NOT TRUE
        LIMIT $5
      ) probe) AS reviews_count,
      (SELECT COUNT(*)::INT FROM (
        SELECT 1
        FROM posts
        JOIN view_public_post_eligibility eligibility ON eligibility.post_id = posts.id
        WHERE posts.created_by_id = combined_ids.id
          AND posts.post_type = 'discussion'
          AND posts.is_anonymous IS NOT TRUE
        LIMIT $5
      ) probe) AS discussions_count,
      (SELECT COUNT(*)::INT FROM (
        SELECT 1
        FROM posts
        JOIN view_public_post_eligibility eligibility ON eligibility.post_id = posts.id
        WHERE posts.created_by_id = combined_ids.id
          AND posts.post_type = 'comment'
          AND posts.is_anonymous IS NOT TRUE
        LIMIT $5
      ) probe) AS comments_count,
      (SELECT COUNT(*)::INT FROM (
        SELECT 1
        FROM relation__user__follow__topic
        WHERE subject_id = combined_ids.id
          AND deleted_at IS NULL
        LIMIT $5
      ) probe) AS topics_following_count,
      (SELECT COUNT(*)::INT FROM (
        SELECT 1
        FROM relation__user__follow__user
        WHERE subject_id = combined_ids.id
          AND deleted_at IS NULL
        LIMIT $5
      ) probe) AS users_following_count,
      (SELECT COUNT(*)::INT FROM (
        SELECT 1
        FROM relation__user__follow__user
        WHERE object_id = combined_ids.id
          AND deleted_at IS NULL
        LIMIT $5
      ) probe) AS users_followers_count,
      (SELECT COUNT(*)::INT FROM (
        SELECT 1
        FROM relation__user__follow__rss_feed
        WHERE subject_id = combined_ids.id
          AND deleted_at IS NULL
        LIMIT $5
      ) probe) AS rss_feeds_following_count,
      (SELECT COUNT(*)::INT FROM (
        SELECT 1
        FROM community_members cm
        INNER JOIN users u ON u.id = cm.user_id AND u.deleted_at IS NULL
        INNER JOIN communities c ON c.id = cm.community_id AND c.deleted_at IS NULL
        WHERE cm.user_id = combined_ids.id
          AND cm.removed_at IS NULL
          AND u.community_memberships_visibility = 'everyone'
          AND c.visibility = 'public'
          AND (cm.role IN ('owner', 'moderator') OR c.member_roster_visibility = 'public')
        LIMIT $5
      ) probe) AS communities_member_count
    FROM combined_ids
    JOIN view_user_metrics vum
      ON vum.id = combined_ids.id
    ORDER BY combined_ids.input_order
    `
