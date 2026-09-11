-- Inline url/hostname base tables instead of chaining views to reduce planner expansion depth.
-- Previously: view_rss_feeds → view_urls → view_url_hostnames (2 levels) + separate hostname JOIN.
CREATE OR REPLACE VIEW view_rss_feeds AS
  SELECT
      'rss_feed' AS __entity_type,
      rss_feeds.id,
      rss_feeds.title,
      current_state.is_enabled,
      current_state.is_discoverable,
      rss_feeds.etag,
      rss_feeds.last_modified_at,
      rss_feeds.last_fetched_at,
      rss_feeds.feed_type,
      rss_feeds.canonical_rss_feed_id,
      json_build_object(
        '__entity_type', 'url',
        'id', feed_url.id,
        'url', feed_url.url,
        'pathname', feed_url.pathname,
        'search_params', feed_url.search_params,
        'canonical_url_id', feed_url.canonical_url_id,
        -- urls.hostname_id is NOT NULL FK → feed_hostname always present (INNER JOIN below)
        'hostname', json_build_object(
          '__entity_type', 'hostname',
          'id', feed_hostname.id,
          'hostname', feed_hostname.hostname,
          'topic_id', feed_hostname.topic_id,
          'blocked', feed_hostname.blocked,
          'crawlable', feed_hostname.crawlable,
          'link_rel_follow', feed_hostname.link_rel_follow
        )
      ) AS rss_feed_url,
      CASE
        WHEN topic_hostname.hostname IS NULL THEN NULL
        ELSE json_build_object('url', CONCAT('https://', topic_hostname.hostname, '/'))
      END AS home_page_url,
      ROW_TO_JSON(view_embedded_topics) AS topic,
      CASE
        WHEN publisher_type_topic.id IS NULL THEN NULL
        ELSE json_build_object(
          'id', publisher_type_topic.id,
          'slug', publisher_type_topic.slug,
          'topic_type', publisher_type_topic.topic_type,
          'name', publisher_type_topic.name
        )
      END AS publisher_type,
      CASE
        WHEN topic_hostname.id IS NULL THEN NULL
        ELSE json_build_object(
          '__entity_type', topic_hostname.__entity_type,
          'id', topic_hostname.id,
          'hostname', topic_hostname.hostname,
          'topic_id', topic_hostname.topic_id
        )
      END AS hostname,
      CASE
        WHEN podcast_show.rss_feed_id IS NULL THEN NULL
        ELSE json_build_object(
          'itunes_author', podcast_show.itunes_author,
          'itunes_owner_name', podcast_show.itunes_owner_name,
          'cover_art_url', podcast_show.cover_art_url,
          'is_explicit', podcast_show.is_explicit,
          'itunes_type', podcast_show.itunes_type,
          'description', podcast_show.description
        )
      END AS podcast_show,
      COALESCE((
        SELECT json_agg(json_build_object(
          'category_text', c.category_text,
          'topic_id', c.topic_id,
          'topic_slug', t.slug
        ) ORDER BY c.category_text)
        FROM rss_feed_categories c
        LEFT JOIN topics t
          ON t.id = c.topic_id
          AND t.deleted_at IS NULL
          AND t.merged_into_topic_id IS NULL
        WHERE c.rss_feed_id = rss_feeds.id
      ), '[]'::json) AS categories
    FROM rss_feeds
    JOIN urls AS feed_url
      ON feed_url.id = rss_feeds.rss_feed_url_id
    JOIN url_hostnames AS feed_hostname
      ON feed_hostname.id = feed_url.hostname_id
    JOIN view_embedded_topics
      ON view_embedded_topics.id = rss_feeds.topic_id
    LEFT JOIN view_url_hostnames AS topic_hostname
      ON topic_hostname.id = view_embedded_topics.hostname_id
    JOIN view_rss_feed_current_states current_state
      ON current_state.rss_feed_id = rss_feeds.id
    LEFT JOIN LATERAL (
      SELECT topics.id, topics.slug, topics.name, topics.topic_type
      FROM relation__topic__publisher_type__topic relation
      JOIN topics ON topics.id = relation.object_id
      WHERE relation.subject_id = rss_feeds.topic_id
        AND relation.deleted_at IS NULL
        AND relation.votes_score_net > 0
        AND topics.deleted_at IS NULL
      ORDER BY relation.votes_score_net DESC NULLS LAST, relation.id ASC
      LIMIT 1
    ) publisher_type_topic ON TRUE
    LEFT JOIN podcast_shows AS podcast_show
      ON podcast_show.rss_feed_id = rss_feeds.id
;
