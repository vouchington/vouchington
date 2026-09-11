-- Rolling public-content aggregate for signed-in topic recommendations. Exact source rows retain
-- authored casing; the view chooses the most frequently observed spelling without exposing sources.
DROP MATERIALIZED VIEW IF EXISTS mv_top_hashtags;

CREATE MATERIALIZED VIEW mv_top_hashtags AS
  WITH eligible_post_hashtags AS (
    SELECT
      source.topic_alias_id,
      source.authored_token,
      source.post_id AS content_id,
      'post' AS content_kind,
      p.created_at AS content_published_at,
      'user:' || source.contributor_id::TEXT AS contributor_id
    FROM post_topic_alias_sources source
    JOIN posts p ON p.id = source.post_id
    JOIN view_public_post_eligibility eligibility ON eligibility.post_id = p.id
    JOIN relation__post__category__topic_alias relation
      ON relation.subject_id = source.post_id
     AND relation.object_id = source.topic_alias_id
     AND relation.deleted_at IS NULL
     AND relation.votes_score_net > 0
    WHERE p.post_type != 'topic_recommendation'
      AND EXISTS (
        SELECT 1
        FROM users contributor
        WHERE contributor.id = source.contributor_id
          AND contributor.is_system = FALSE
          AND contributor.deleted_at IS NULL
      )
      AND EXISTS (
        SELECT 1
        FROM users post_creator
        WHERE post_creator.id = p.created_by_id
          AND post_creator.is_system = FALSE
      )
      AND NOT EXISTS (
        SELECT 1
        FROM user_suspensions suspension
        WHERE suspension.user_id = source.contributor_id
          AND suspension.lifted_at IS NULL
      )
      AND p.id >= uuidv7(INTERVAL '-30 days')
  ),
  eligible_rss_hashtags AS (
    SELECT
      category.topic_alias_id,
      category.category_text AS authored_token,
      category.rss_feed_item_id AS content_id,
      'rss_feed_item' AS content_kind,
      item.published_at AS content_published_at,
      'rss:' || identity.url_hostname_id::TEXT AS contributor_id
    FROM rss_feed_item_categories category
    JOIN rss_feed_items item ON item.id = category.rss_feed_item_id
    JOIN rss_feed_item_ids identity ON identity.id = item.id
    WHERE category.topic_alias_id IS NOT NULL
      AND item.deleted_at IS NULL
      AND item.published_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
      AND EXISTS (
        SELECT 1
        FROM rss_feed_item_sources source
        JOIN rss_feeds feed ON feed.id = source.rss_feed_id
        JOIN topics feed_topic ON feed_topic.id = feed.topic_id
        WHERE source.rss_feed_item_id = item.id
          AND feed.deleted_at IS NULL
          AND feed.is_enabled = TRUE
          AND feed.is_discoverable = TRUE
          AND feed_topic.deleted_at IS NULL
          AND feed_topic.merged_into_topic_id IS NULL
      )
      AND EXISTS (
        SELECT 1 FROM relation__rss_feed_item__category__topic_alias relation
        WHERE relation.subject_id = item.id
          AND relation.object_id = category.topic_alias_id
          AND relation.deleted_at IS NULL
          AND relation.votes_score_net > 0
      )
  ),
  occurrences AS (
    SELECT * FROM eligible_post_hashtags
    UNION ALL
    SELECT * FROM eligible_rss_hashtags
  ),
  casing_frequency AS (
    SELECT
      topic_alias_id,
      authored_token,
      COUNT(DISTINCT content_kind || ':' || content_id::TEXT)::BIGINT AS item_count,
      MAX(content_published_at) AS latest_content_at,
      (ARRAY_AGG(content_id ORDER BY content_published_at DESC, content_id DESC))[1] AS latest_content_id
    FROM occurrences
    GROUP BY topic_alias_id, authored_token
  ),
  casing AS (
    SELECT DISTINCT ON (topic_alias_id)
      topic_alias_id,
      authored_token AS display_hashtag
    FROM casing_frequency
    ORDER BY topic_alias_id, item_count DESC, latest_content_at DESC, latest_content_id DESC, authored_token ASC
  ),
  aggregate AS (
    SELECT
      topic_alias_id,
      COUNT(DISTINCT content_kind || ':' || content_id::TEXT)::BIGINT AS item_count,
      COUNT(DISTINCT contributor_id)::BIGINT AS contributor_count,
      MAX(content_published_at) AS latest_content_at,
      (ARRAY_AGG(content_id ORDER BY content_published_at DESC, content_id DESC))[1] AS latest_content_id
    FROM occurrences
    GROUP BY topic_alias_id
  )
  SELECT
    aggregate.topic_alias_id,
    casing.display_hashtag,
    aggregate.item_count,
    aggregate.contributor_count,
    aggregate.latest_content_at,
    aggregate.latest_content_id
  FROM aggregate
  JOIN casing USING (topic_alias_id)
  WHERE aggregate.contributor_count >= 3;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_top_hashtags__topic_alias_id
  ON mv_top_hashtags (topic_alias_id);

CREATE INDEX IF NOT EXISTS idx_mv_top_hashtags__ranking
  ON mv_top_hashtags (item_count DESC, latest_content_at DESC, latest_content_id DESC, topic_alias_id DESC);

COMMENT ON MATERIALIZED VIEW mv_top_hashtags IS 'Rolling 30-day top-hashtag recommendations from public posts and discoverable RSS items. Refreshes are debounce-enqueued from content, moderation, and topic lifecycle events and hourly as a safety net.';
