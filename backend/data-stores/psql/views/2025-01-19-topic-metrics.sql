CREATE OR REPLACE VIEW view_topic_metrics AS
  SELECT
    'topic_metrics' AS __entity_type,
    topic_id AS id,
    (
      -- Candidate-bind from the topic side (indexed on object_id/topic_id) before
      -- joining posts + the eligibility view, so the planner can pull this view up
      -- into an indexed per-topic lookup instead of re-deriving the whole
      -- topic-independent eligible-discussion set for every output row. See
      -- backend/data-stores/psql/reference-migrations-views-and-config-driven.md
      -- for why this must stay UNION ALL with no CTE.
      SELECT COUNT(DISTINCT posts.id)::bigint
      FROM (
        SELECT rel.subject_id AS post_id
        FROM relation__post__category__topic rel
        WHERE rel.object_id = topic_metrics.topic_id
          AND rel.deleted_at IS NULL
          AND rel.votes_score_net > 0

        UNION ALL

        -- Membership is the alias relation alone, not authorship: see
        -- docs/requirements/content/reference-topics-topic-aliases.md § Hashtag aliases.
        SELECT alias_relation.subject_id AS post_id
        FROM topic_aliases alias
        JOIN relation__post__category__topic_alias alias_relation
          ON alias_relation.object_id = alias.id
         AND alias_relation.deleted_at IS NULL
         AND alias_relation.votes_score_net > 0
        WHERE alias.topic_id = topic_metrics.topic_id
      ) candidate
      JOIN posts ON posts.id = candidate.post_id
      JOIN view_public_post_eligibility eligibility ON eligibility.post_id = posts.id
      WHERE posts.post_type = 'discussion'
    ) AS count__discussions,
    (
      SELECT COUNT(DISTINCT posts.id)::bigint
      FROM posts
      JOIN view_public_post_eligibility eligibility ON eligibility.post_id = posts.id
      JOIN post_review_topic_ratings prtr
        ON prtr.post_id = posts.id
       AND prtr.topic_id = topic_metrics.topic_id
      WHERE posts.post_type = 'review'
    ) AS count__reviews,
    (
      SELECT COUNT(DISTINCT posts.id)::bigint
      FROM posts
      JOIN view_public_post_eligibility eligibility ON eligibility.post_id = posts.id
      JOIN post_data_point_topics pdpt
        ON pdpt.post_id = posts.id
       AND pdpt.topic_id = topic_metrics.topic_id
      WHERE posts.post_type = 'data_point'
    ) AS count__data_points,
    (
      SELECT COUNT(DISTINCT rfic.rss_feed_item_id)::bigint
      FROM rss_feed_item_categories rfic
      JOIN rss_feed_items rfi
        ON rfi.id = rfic.rss_feed_item_id
      JOIN rss_feed_item_sources rfis
        ON rfis.rss_feed_item_id = rfi.id
      JOIN rss_feeds rf
        ON rf.id = rfis.rss_feed_id
      JOIN view_rss_feed_current_states current_state
        ON current_state.rss_feed_id = rf.id
      WHERE rfic.topic_id = topic_metrics.topic_id
        AND rfi.deleted_at IS NULL
        AND rf.deleted_at IS NULL
        AND current_state.is_enabled = TRUE
        AND current_state.is_discoverable = TRUE
    ) AS count__news,
    (
      SELECT COUNT(DISTINCT rss_feed_items.id)::bigint
      FROM rss_feed_items
      JOIN rss_feed_item_sources rfis
        ON rfis.rss_feed_item_id = rss_feed_items.id
      JOIN rss_feeds
        ON rss_feeds.id = rfis.rss_feed_id
      JOIN view_rss_feed_current_states current_state
        ON current_state.rss_feed_id = rss_feeds.id
      WHERE rss_feeds.topic_id = topic_metrics.topic_id
        AND rss_feeds.deleted_at IS NULL
        AND current_state.is_enabled = TRUE
        AND current_state.is_discoverable = TRUE
        AND rss_feed_items.deleted_at IS NULL
    ) AS count__latest,
    ratings__count__1,
    ratings__count__2,
    ratings__count__3,
    ratings__count__4,
    ratings__count__5,
    ratings__updated_at,
    bookmarks__follow_count,
    bookmarks__updated_at
  FROM topic_metrics
;
