-- One rolling 30-day score per public community that had approved public posts in the window.
-- Weights match the former read-time score: members + windowed posts + proxy follows + proxy mutes.
-- squawk-ignore ban-drop-view -- PostgreSQL cannot replace a materialized view in place.
DROP MATERIALIZED VIEW IF EXISTS mv_trending_communities;

CREATE MATERIALIZED VIEW mv_trending_communities AS
WITH recent_posts AS (
  SELECT p.community_id, COUNT(*)::INT AS post_count
  FROM posts p
  JOIN community_post_reviews review
    ON review.post_id = p.id
   AND review.community_id = p.community_id
   AND review.approved_at IS NOT NULL
   AND review.unpublished_at IS NULL
   AND review.rejected_at IS NULL
  JOIN view_public_post_eligibility eligibility ON eligibility.post_id = p.id
  WHERE p.community_id IS NOT NULL
    AND p.id >= fn_min_uuidv7(CURRENT_TIMESTAMP - INTERVAL '30 days')
  GROUP BY p.community_id
), members AS (
  SELECT member.community_id, COUNT(*)::INT AS member_count
  FROM recent_posts
  JOIN community_members member ON member.community_id = recent_posts.community_id
  WHERE member.removed_at IS NULL
  GROUP BY member.community_id
), recent_follows AS (
  SELECT relation.object_id AS community_id, COUNT(*)::INT AS follow_count
  FROM relation__user__proxy_follow__community relation
  JOIN recent_posts ON recent_posts.community_id = relation.object_id
  WHERE relation.deleted_at IS NULL
    AND relation.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
  GROUP BY relation.object_id
), recent_mutes AS (
  SELECT relation.object_id AS community_id, COUNT(*)::INT AS mute_count
  FROM relation__user__proxy_mute__community relation
  JOIN recent_posts ON recent_posts.community_id = relation.object_id
  WHERE relation.deleted_at IS NULL
    AND relation.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
  GROUP BY relation.object_id
)
SELECT
  community.id,
  (
    COALESCE(members.member_count, 0)
    + recent_posts.post_count
    + COALESCE(recent_follows.follow_count, 0)
    + COALESCE(recent_mutes.mute_count, 0)
  )::DOUBLE PRECISION AS trending_score
FROM recent_posts
JOIN communities community ON community.id = recent_posts.community_id
LEFT JOIN members ON members.community_id = community.id
LEFT JOIN recent_follows ON recent_follows.community_id = community.id
LEFT JOIN recent_mutes ON recent_mutes.community_id = community.id
WHERE community.deleted_at IS NULL AND community.visibility = 'public';

CREATE UNIQUE INDEX idx_mv_trending_communities__id ON mv_trending_communities (id);
CREATE INDEX idx_mv_trending_communities__ranking
  ON mv_trending_communities (trending_score DESC, id DESC);
COMMENT ON MATERIALIZED VIEW mv_trending_communities IS 'Rolling 30-day community scores, refreshed on the PostgreSQL materialized-view schedule.';
