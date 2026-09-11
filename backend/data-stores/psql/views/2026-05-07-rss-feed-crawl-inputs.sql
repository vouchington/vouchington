-- DROP + plain CREATE (not CREATE ... IF NOT EXISTS) so this checked-in definition is
-- authoritative on every `runViews` deploy: the scoring query and tier thresholds below
-- always take effect, instead of being silently skipped when the MV already exists.
-- CREATE MATERIALIZED VIEW ... AS SELECT repopulates the MV immediately during runViews, so
-- deploys recompute tiers from the current data instead of waiting for the nightly refresh.
DROP MATERIALIZED VIEW IF EXISTS mv_rss_feed_crawl_tiers;

CREATE MATERIALIZED VIEW mv_rss_feed_crawl_tiers AS
  WITH canonical_follows AS (
    -- Route followers on permanently-redirected source feeds through canonical_rss_feed_id,
    -- then retain each user's demand once per canonical feed.
    SELECT
      COALESCE(rf.canonical_rss_feed_id, rf.id) AS rss_feed_id,
      f.subject_id AS user_id
    FROM relation__user__follow__rss_feed f
    JOIN rss_feeds rf ON rf.id = f.object_id
    WHERE f.deleted_at IS NULL
    GROUP BY COALESCE(rf.canonical_rss_feed_id, rf.id), f.subject_id
  ),
  active_paid_memberships AS (
    SELECT user_id, plan
    FROM view_current_paid_memberships
  ),
  follow_counts AS (
    SELECT
      cf.rss_feed_id,
      SUM(
        CASE apm.plan
          WHEN 'plus' THEN 2
          WHEN 'pro' THEN 3
          ELSE 1
        END
      )::INT AS weighted_follower_count
    FROM canonical_follows cf
    LEFT JOIN active_paid_memberships apm ON apm.user_id = cf.user_id
    GROUP BY cf.rss_feed_id
  ),
  scored AS (
    SELECT
      rf.id AS rss_feed_id,
      LN(1 + COALESCE(fc.weighted_follower_count, 0)::DOUBLE PRECISION)
        + COALESCE(t.votes_score_net, 0)::DOUBLE PRECISION AS crawl_score
    FROM rss_feeds rf
    JOIN topics t ON t.id = rf.topic_id
    LEFT JOIN follow_counts fc ON fc.rss_feed_id = rf.id
    WHERE rf.deleted_at IS NULL
      AND rf.is_enabled = TRUE
  ),
  ranked AS (
    SELECT
      rss_feed_id,
      crawl_score,
      CUME_DIST() OVER (ORDER BY crawl_score DESC) AS pct_rank
    FROM scored
  )
  SELECT
    rss_feed_id,
    crawl_score::DOUBLE PRECISION,
    CASE
      WHEN pct_rank <= 0.001 THEN 1
      WHEN pct_rank <= 0.01  THEN 2
      WHEN pct_rank <= 0.05  THEN 3
      WHEN pct_rank <= 0.20  THEN 4
      ELSE 5
    END::SMALLINT AS crawl_tier
  FROM ranked;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_rss_feed_crawl_tiers__rss_feed_id
  ON mv_rss_feed_crawl_tiers (rss_feed_id);

COMMENT ON MATERIALIZED VIEW mv_rss_feed_crawl_tiers IS 'Precomputed crawl_score and crawl_tier per enabled RSS feed. Refreshed nightly by the psql refreshMaterializedView job (refresh-rss-feed-crawl-tiers). Tier percentile thresholds (0.1%/1%/5%/20%) and score formula (log1p(weighted followers) + votes_score_net) are baked into this SQL. Unique follower demand weights are free=1, Plus=2, Pro=3, based on current active or past-due memberships with expires_at null or future. Unique index enables CONCURRENTLY refresh.';
