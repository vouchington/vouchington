CREATE OR REPLACE VIEW view_rss_feed_items AS
  SELECT
    'rss_feed_item' AS __entity_type,
    rss_feed_items.id,
    rss_feed_item_ids.guid,
    rss_feed_item_ids.url_hostname_id,
    rss_feed_items.published_at,
    rss_feed_items.media_type,
    rss_feed_items.enclosure_url,
    rss_feed_items.enclosure_type,
    rss_feed_items.enclosure_length,
    rss_feed_items.duration_seconds,
    rss_feed_items.thumbnail_url,
    rss_feed_items.video_id,
    rss_feed_items.video_platform,
    rss_feed_items.data,
    ROW_TO_JSON(view_urls.*) AS url,
    -- Primary source feed: enabled feeds first, then discoverable feeds, then by owning
    -- topic rating (votes_score_net DESC), then earliest-discovered (created_at ASC).
    ROW_TO_JSON(primary_feed.*) AS rss_feed,
    -- All source feeds that contain this item, as a JSON array.
    -- Order: enabled first, then discoverable first, then owning topic rating DESC, then discovery time ASC.
    COALESCE(all_sources.rss_feed_sources, '[]'::json) AS rss_feed_sources,
    COALESCE((
      SELECT json_agg(cat ORDER BY cat_order ASC, cat_score DESC NULLS LAST, cat_text ASC)
      FROM (
        -- Topic chips: votable relations with positive net score, ranked by score
        SELECT
          jsonb_build_object(
            'id', rel.id,
            'category_text', vet.name,
            'topic', TO_JSONB(vet.*),
            'hashtag', CASE WHEN mapped_hashtag.id IS NULL THEN NULL ELSE jsonb_build_object(
              'id', mapped_hashtag.id,
              'key', mapped_hashtag.alias,
              'display_token', mapped_hashtag.category_text,
              'topic_id', mapped_hashtag.topic_id
            ) END,
            'votes_score_net', rel.votes_score_net
          ) AS cat,
          0 AS cat_order,
          rel.votes_score_net AS cat_score,
          COALESCE(mapped_hashtag.category_text, vet.name) AS cat_text
        FROM relation__rss_feed_item__category__topic rel
        JOIN view_embedded_topics vet ON vet.id = rel.object_id
        LEFT JOIN LATERAL (
          SELECT alias.id, alias.alias, alias.topic_id, rfc.category_text
          FROM rss_feed_item_categories rfc
          JOIN topic_aliases alias ON alias.id = rfc.topic_alias_id
          JOIN relation__rss_feed_item__category__topic_alias alias_relation
            ON alias_relation.subject_id = rfc.rss_feed_item_id
            AND alias_relation.object_id = rfc.topic_alias_id
            AND alias_relation.deleted_at IS NULL
            AND alias_relation.votes_score_net > 0
          WHERE rfc.rss_feed_item_id = rel.subject_id
            AND rfc.topic_id = rel.object_id
        ) mapped_hashtag ON true
        WHERE rel.subject_id = rss_feed_items.id
          AND rel.deleted_at IS NULL
          AND rel.votes_score_net > 0

        UNION ALL

        -- Free-text badges: feed categories not resolved to a topic, shown after topic chips
        SELECT
          jsonb_build_object(
            'id', NULL,
            'category_text', rfc.category_text,
            'topic', NULL,
            'hashtag', CASE WHEN alias.id IS NULL THEN NULL ELSE jsonb_build_object(
              'id', alias.id,
              'key', alias.alias,
              'display_token', rfc.category_text,
              'topic_id', alias.topic_id
            ) END,
            'votes_score_net', NULL
          ) AS cat,
          1 AS cat_order,
          NULL::double precision AS cat_score,
          rfc.category_text AS cat_text
        FROM rss_feed_item_categories rfc
        LEFT JOIN topic_aliases alias ON alias.id = rfc.topic_alias_id
        LEFT JOIN relation__rss_feed_item__category__topic_alias relation
          ON relation.subject_id = rfc.rss_feed_item_id
          AND relation.object_id = rfc.topic_alias_id
          AND relation.deleted_at IS NULL
          AND relation.votes_score_net > 0
        WHERE rfc.rss_feed_item_id = rss_feed_items.id
          AND (
            rfc.topic_id IS NULL
            OR NOT EXISTS (
              SELECT 1
              FROM relation__rss_feed_item__category__topic topic_relation
              WHERE topic_relation.subject_id = rfc.rss_feed_item_id
                AND topic_relation.object_id = rfc.topic_id
                AND topic_relation.deleted_at IS NULL
                AND topic_relation.votes_score_net > 0
            )
          )
          AND (rfc.topic_alias_id IS NULL OR relation.id IS NOT NULL)
      ) sub
    ), '[]'::json) AS categories,
    rss_feed_items.lingua_rs_detected_language
  FROM rss_feed_items
  JOIN rss_feed_item_ids
    ON rss_feed_item_ids.id = rss_feed_items.id
  LEFT JOIN view_urls
    ON view_urls.id = rss_feed_items.url_id
  -- Pick the highest-ranked source feed.
  -- Rank: enabled feeds first, then discoverable feeds, then owning topic
  -- votes_score_net DESC, then earliest-discovered (rss_feed_item_sources.created_at ASC)
  -- as stable tie-breaker.
  -- Uses INNER JOIN LATERAL so items with no source feeds are excluded from the view.
  JOIN LATERAL (
    SELECT rfis.rss_feed_id
    FROM rss_feed_item_sources rfis
    JOIN rss_feeds rf ON rf.id = rfis.rss_feed_id
    JOIN topics t ON t.id = rf.topic_id
    JOIN view_rss_feed_current_states current_state
      ON current_state.rss_feed_id = rf.id
    WHERE rfis.rss_feed_item_id = rss_feed_items.id
      AND rf.deleted_at IS NULL
    ORDER BY
      current_state.is_enabled DESC,
      current_state.is_discoverable DESC,
      t.votes_score_net DESC NULLS LAST,
      rfis.created_at ASC
    LIMIT 1
  ) best_source ON true
  JOIN view_rss_feeds primary_feed
    ON primary_feed.id = best_source.rss_feed_id
  -- Aggregate all source feeds as a JSON array, same ordering as primary selection.
  LEFT JOIN LATERAL (
    SELECT json_agg(
      ROW_TO_JSON(vrf.*)
      ORDER BY
        vrf.is_enabled DESC,
        vrf.is_discoverable DESC,
        t2.votes_score_net DESC NULLS LAST,
        rfis2.created_at ASC
    ) AS rss_feed_sources
    FROM rss_feed_item_sources rfis2
    JOIN rss_feeds rf2 ON rf2.id = rfis2.rss_feed_id
    JOIN view_rss_feeds vrf ON vrf.id = rfis2.rss_feed_id
    JOIN topics t2 ON t2.id = rf2.topic_id
    WHERE rfis2.rss_feed_item_id = rss_feed_items.id
  ) all_sources ON true
  WHERE rss_feed_items.deleted_at IS NULL
;
