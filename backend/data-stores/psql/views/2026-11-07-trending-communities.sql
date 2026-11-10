-- One rolling 30-day score per public community that had approved public posts in the window.
-- Weights: capped active members + windowed posts + proxy follows + proxy mutes.
-- Eligibility matches view_public_post_eligibility as WHERE/EXISTS on base tables.
-- That view contains MATERIALIZED CTEs and does not pull up, so joining it plans a per-post
-- rescan when statistics are missing.
-- The member probe reads LIMIT cap+1 rows from the trending_community_member_count_caps singleton.
-- members_capped is true when another active member exists past the cap. The score counts the cap.
-- squawk-ignore ban-drop-view -- PostgreSQL cannot replace a materialized view in place.
DROP MATERIALIZED VIEW IF EXISTS mv_trending_communities;

CREATE MATERIALIZED VIEW mv_trending_communities AS
WITH cap AS (
  SELECT COALESCE((SELECT stored.member_count_cap FROM trending_community_member_count_caps stored WHERE stored.is_singleton), 1000)::INT AS member_count_cap
), recent_posts AS (
  SELECT candidate.community_id, COUNT(*)::INT AS post_count
  FROM posts candidate
  WHERE candidate.community_id IS NOT NULL
    AND candidate.id >= fn_min_uuidv7(CURRENT_TIMESTAMP - INTERVAL '30 days')
    AND candidate.deleted_at IS NULL
    AND candidate.approved_at IS NOT NULL
    AND candidate.archived_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM user_suspensions candidate_suspension
      WHERE candidate_suspension.user_id = candidate.created_by_id
        AND candidate_suspension.lifted_at IS NULL
    )
    AND EXISTS (
      SELECT 1
      FROM posts root_post
      WHERE root_post.id = COALESCE(candidate.root_post_id, candidate.id)
        AND root_post.deleted_at IS NULL
        AND root_post.approved_at IS NOT NULL
        AND root_post.archived_at IS NULL
        AND root_post.privacy = 'public'
        AND root_post.broadcast = 'everyone'
        AND NOT EXISTS (
          SELECT 1
          FROM user_suspensions root_suspension
          WHERE root_suspension.user_id = root_post.created_by_id
            AND root_suspension.lifted_at IS NULL
        )
        AND (
          root_post.community_id IS NULL
          OR EXISTS (
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
        )
        AND (
          root_post.post_type <> 'story'
          OR EXISTS (
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
                SELECT 1
                FROM rss_feed_item_sources story_source
                JOIN rss_feeds story_feed ON story_feed.id = story_source.rss_feed_id
                WHERE story_source.rss_feed_item_id = story_item.id
                  AND story_feed.deleted_at IS NULL
                  AND story_feed.is_enabled = TRUE
                  AND story_feed.is_discoverable = TRUE
              )
          )
        )
    )
    AND EXISTS (
      SELECT 1
      FROM community_post_reviews review
      WHERE review.community_id = candidate.community_id
        AND review.post_id = candidate.id
        AND review.approved_at IS NOT NULL
        AND review.unpublished_at IS NULL
        AND review.rejected_at IS NULL
    )
  GROUP BY candidate.community_id
)
SELECT
  community.id,
  (
    CASE
      WHEN member_probe.probed > cap.member_count_cap THEN cap.member_count_cap
      ELSE member_probe.probed
    END
    + recent_posts.post_count
    + follow_probe.follow_count
    + mute_probe.mute_count
  )::DOUBLE PRECISION AS trending_score,
  (member_probe.probed > cap.member_count_cap) AS members_capped
FROM recent_posts
CROSS JOIN cap
JOIN communities community ON community.id = recent_posts.community_id
CROSS JOIN LATERAL (
  SELECT COUNT(*)::INT AS probed
  FROM (
    SELECT 1
    FROM community_members member
    WHERE member.community_id = recent_posts.community_id
      AND member.removed_at IS NULL
    LIMIT (SELECT probe_cap.member_count_cap FROM cap probe_cap) + 1
  ) limited
) member_probe
CROSS JOIN LATERAL (
  SELECT COUNT(*)::INT AS follow_count
  FROM relation__user__proxy_follow__community relation
  WHERE relation.object_id = recent_posts.community_id
    AND relation.deleted_at IS NULL
    AND relation.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
) follow_probe
CROSS JOIN LATERAL (
  SELECT COUNT(*)::INT AS mute_count
  FROM relation__user__proxy_mute__community relation
  WHERE relation.object_id = recent_posts.community_id
    AND relation.deleted_at IS NULL
    AND relation.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
) mute_probe
WHERE community.deleted_at IS NULL
  AND community.visibility = 'public';

CREATE UNIQUE INDEX idx_mv_trending_communities__id ON mv_trending_communities (id);
CREATE INDEX idx_mv_trending_communities__ranking
  ON mv_trending_communities (trending_score DESC, id DESC);
COMMENT ON MATERIALIZED VIEW mv_trending_communities IS 'Rolling 30-day community scores, refreshed on the PostgreSQL materialized-view schedule.';
COMMENT ON COLUMN mv_trending_communities.members_capped IS 'True when the community has more active members than the trending member-count cap. The score counts only the cap.';
