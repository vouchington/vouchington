-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE VIEW view_community_metrics AS
  SELECT
    'community_metrics' AS __entity_type,
    c.id,
    (
      SELECT COUNT(*)::int
      FROM community_members cm
      WHERE cm.community_id = c.id
        AND cm.removed_at IS NULL
    ) AS member_count,
    (
      WITH keyed_posts AS MATERIALIZED (
        SELECT id
        FROM posts
        WHERE community_id = c.id
      )
      SELECT COUNT(*)::int
      FROM keyed_posts p
      JOIN view_public_post_eligibility eligibility ON eligibility.post_id = p.id
      -- The review is unique by post_id. Keep its lookup correlated to each keyed
      -- post so the planner cannot re-scan reviews before the selected page is known.
      JOIN LATERAL (
        SELECT 1
        FROM community_post_reviews cpr
        WHERE cpr.post_id = p.id
          AND cpr.community_id = c.id
          AND cpr.approved_at IS NOT NULL
          AND cpr.unpublished_at IS NULL
          AND cpr.rejected_at IS NULL
        LIMIT 1
      ) approved_review ON TRUE
    ) AS post_count,
    (
      SELECT COUNT(*)::int
      FROM view_community_list_items vcli
      WHERE vcli.community_id = c.id
    ) AS list_item_count,
    proxy_follow.proxy_follow_count,
    proxy_mute.proxy_mute_count,
    proxy_follow.proxy_follow_count + proxy_mute.proxy_mute_count AS virtual_subscription_count
  FROM communities c
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS proxy_follow_count
    FROM relation__user__proxy_follow__community rpf
    WHERE rpf.object_id = c.id
      AND rpf.deleted_at IS NULL
  ) proxy_follow ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS proxy_mute_count
    FROM relation__user__proxy_mute__community rpm
    WHERE rpm.object_id = c.id
      AND rpm.deleted_at IS NULL
  ) proxy_mute ON TRUE
  WHERE c.deleted_at IS NULL
;

COMMENT ON VIEW view_community_metrics IS 'Community activity metrics for authorized community reads.';
