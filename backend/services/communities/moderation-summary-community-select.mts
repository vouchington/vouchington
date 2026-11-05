import sql from 'sql-template-strings'

export function communityModerationSummarySelect(
  windowStartId: string,
  windowEndId: string,
  windowStart: Date,
  activityWindowEnd: Date,
) {
  return sql`
    SELECT
      c.name,
      c.slug,
      c.id,
      COALESCE((
        SELECT COUNT(*)::int
        FROM community_post_reviews cpr
        INNER JOIN posts rp
          ON rp.id = cpr.post_id
          AND rp.deleted_at IS NULL
        WHERE cpr.community_id = c.id
          AND cpr.approved_at IS NULL
          AND cpr.rejected_at IS NULL
      ), 0) AS pending_post_reviews,
      COALESCE((
        SELECT COUNT(*)::int
        FROM community_applications ca
        WHERE ca.community_id = c.id
          AND ca.approved_at IS NULL
          AND ca.rejected_at IS NULL
      ), 0) AS pending_applications,
      COALESCE((
        SELECT COUNT(*)::int
        FROM moderation_reports mr
        INNER JOIN posts p ON p.id = mr.post_id
        WHERE p.community_id = c.id
          AND mr.reviewed_at IS NULL
      ), 0) AS pending_reports,
      COALESCE((
        SELECT COUNT(*)::int
        FROM community_post_reviews cpr
        INNER JOIN posts rp
          ON rp.id = cpr.post_id
          AND rp.deleted_at IS NULL
        WHERE cpr.community_id = c.id
          AND cpr.approved_at IS NULL
          AND cpr.rejected_at IS NULL
          AND cpr.escalated_at IS NOT NULL
      ), 0) + COALESCE((
        SELECT COUNT(*)::int
        FROM moderation_reports mr
        INNER JOIN posts p ON p.id = mr.post_id
        LEFT JOIN LATERAL (
          SELECT mj.recommended_action
          FROM moderation_report_judgements mj
          WHERE mj.post_id IS NOT DISTINCT FROM mr.post_id
            AND mj.reported_user_id IS NOT DISTINCT FROM mr.reported_user_id
            AND mj.hostname_id IS NOT DISTINCT FROM mr.hostname_id
            AND mj.rss_feed_item_id IS NOT DISTINCT FROM mr.rss_feed_item_id
          ORDER BY mj.id DESC
          LIMIT 1
        ) latest_judgement ON TRUE
        WHERE p.community_id = c.id
          AND mr.reviewed_at IS NULL
          AND (
            mr.escalated_at IS NOT NULL
            OR latest_judgement.recommended_action = 'escalate'
          )
      ), 0) AS escalated_items,
      COALESCE((
        SELECT COUNT(*)::int
        FROM community_members cm2
        WHERE cm2.community_id = c.id
          AND cm2.removed_at IS NULL
          AND cm2.suspected_ban_evader_at IS NOT NULL
          AND cm2.suspected_ban_evader_dismissed_at IS NULL
      ), 0) AS suspected_ban_evaders,
      COALESCE((
        SELECT COUNT(*)::int
        FROM community_members joined_members
        INNER JOIN users joined_member_user
          ON joined_member_user.id = joined_members.user_id
          AND joined_member_user.deleted_at IS NULL
        WHERE joined_members.community_id = c.id
          AND joined_members.id >= ${windowStartId}
          AND joined_members.id < ${windowEndId}
      ), 0) AS new_members,
      COALESCE((
        SELECT COUNT(*)::int
        FROM community_members departed_members
        WHERE departed_members.community_id = c.id
          AND departed_members.removed_at >= ${windowStart}
          AND departed_members.removed_at < ${activityWindowEnd}
      ), 0) AS departed_members,
      COALESCE((
        SELECT COUNT(*)::int
        FROM community_members active_members
        INNER JOIN users active_member_user
          ON active_member_user.id = active_members.user_id
          AND active_member_user.deleted_at IS NULL
        WHERE active_members.community_id = c.id
          AND active_members.removed_at IS NULL
      ), 0) AS total_active_members,
      COALESCE((
        SELECT COUNT(*)::int
        FROM posts np
        WHERE np.community_id = c.id
          AND np.post_type = 'discussion'
          AND np.id >= ${windowStartId}
          AND np.id < ${windowEndId}
          AND np.deleted_at IS NULL
      ), 0) AS new_discussion_posts,
      COALESCE((
        SELECT COUNT(*)::int
        FROM posts np
        WHERE np.community_id = c.id
          AND np.post_type = 'review'
          AND np.id >= ${windowStartId}
          AND np.id < ${windowEndId}
          AND np.deleted_at IS NULL
      ), 0) AS new_review_posts,
      COALESCE((
        SELECT COUNT(*)::int
        FROM posts np
        WHERE np.community_id = c.id
          AND np.post_type = 'data_point'
          AND np.id >= ${windowStartId}
          AND np.id < ${windowEndId}
          AND np.deleted_at IS NULL
      ), 0) AS new_data_point_posts,
      top_discussion.title AS top_discussion_title,
      top_discussion.reply_count AS top_discussion_reply_count,
      COALESCE((
        SELECT COUNT(DISTINCT engaged_members.user_id)::int
        FROM community_members engaged_members
        WHERE engaged_members.community_id = c.id
          AND engaged_members.removed_at IS NULL
          AND EXISTS (
            SELECT 1
            FROM posts engagement_post
            WHERE engagement_post.created_by_id = engaged_members.user_id
              AND engagement_post.community_id = c.id
              AND engagement_post.id >= ${windowStartId}
              AND engagement_post.id < ${windowEndId}
              AND engagement_post.deleted_at IS NULL
          )
      ), 0) AS active_member_count
    FROM community_members cm
    INNER JOIN communities c
      ON c.id = cm.community_id
      AND c.deleted_at IS NULL
      AND c.archived_at IS NULL`
}
