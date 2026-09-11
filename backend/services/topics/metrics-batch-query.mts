export function buildTopicMetricsBatchQuery(inputCtes: string): string {
  return `/* getTopicMetricsByAnyBatch */
    -- no-mistakes-disable-next-line postgres-required-predicates: dynamic input CTE interpolation
    -- breaks structural SQL parsing; id_lookups/slug_lookups filter deleted and merged topics.
    WITH ${inputCtes},
    id_lookups AS (
      SELECT COALESCE(t.merged_into_topic_id, t.id) AS id, input_data.input_order
      FROM topics t
      LEFT JOIN topics destination_topic ON destination_topic.id = t.merged_into_topic_id
      JOIN input_data ON t.id = input_data.input_value
      WHERE t.deleted_at IS NULL
        AND (
          t.merged_into_topic_id IS NULL
          OR (destination_topic.deleted_at IS NULL AND destination_topic.merged_into_topic_id IS NULL)
        )
    ),
    slug_lookups AS (
      SELECT DISTINCT ON (slug_input_data.input_order)
        COALESCE(t.merged_into_topic_id, t.id) AS id,
        slug_input_data.input_order
      FROM topics t
      LEFT JOIN topic_aliases ta ON ta.topic_id = t.id
      LEFT JOIN topics destination_topic ON destination_topic.id = t.merged_into_topic_id
      JOIN slug_input_data ON (t.slug = slug_input_data.input_value OR ta.alias = slug_input_data.input_value)
      WHERE t.deleted_at IS NULL
        AND (
          t.merged_into_topic_id IS NULL
          OR (destination_topic.deleted_at IS NULL AND destination_topic.merged_into_topic_id IS NULL)
        )
      ORDER BY
        slug_input_data.input_order,
        CASE
          WHEN t.slug = slug_input_data.input_value AND t.merged_into_topic_id IS NULL THEN 0
          WHEN t.slug = slug_input_data.input_value THEN 1
          ELSE 2
        END,
        t.id
    ),
    combined_ids AS (
      SELECT id, input_order FROM id_lookups
      UNION
      SELECT id, input_order FROM slug_lookups
    ),
    requested_topic_ids AS (
      SELECT DISTINCT id FROM combined_ids
    ),
    discussion_candidates AS (
      SELECT requested.id AS topic_id, relation.subject_id AS post_id
      FROM requested_topic_ids requested
      JOIN relation__post__category__topic relation
        ON relation.object_id = requested.id
       AND relation.deleted_at IS NULL
       AND relation.votes_score_net > 0
      UNION ALL
      SELECT requested.id AS topic_id, alias_relation.subject_id AS post_id
      FROM requested_topic_ids requested
      JOIN topic_aliases alias ON alias.topic_id = requested.id
      JOIN relation__post__category__topic_alias alias_relation
        ON alias_relation.object_id = alias.id
       AND alias_relation.deleted_at IS NULL
       AND alias_relation.votes_score_net > 0
    ),
    discussion_counts AS (
      SELECT candidate.topic_id, COUNT(DISTINCT post.id)::bigint AS count
      FROM discussion_candidates candidate
      JOIN posts post ON post.id = candidate.post_id
      JOIN view_public_post_eligibility eligibility ON eligibility.post_id = post.id
      WHERE post.post_type = 'discussion'
      GROUP BY candidate.topic_id
    ),
    review_counts AS (
      SELECT rating.topic_id, COUNT(DISTINCT post.id)::bigint AS count
      FROM requested_topic_ids requested
      JOIN post_review_topic_ratings rating ON rating.topic_id = requested.id
      JOIN posts post ON post.id = rating.post_id
      JOIN view_public_post_eligibility eligibility ON eligibility.post_id = post.id
      WHERE post.post_type = 'review'
      GROUP BY rating.topic_id
    ),
    data_point_counts AS (
      SELECT mapping.topic_id, COUNT(DISTINCT post.id)::bigint AS count
      FROM requested_topic_ids requested
      JOIN post_data_point_topics mapping ON mapping.topic_id = requested.id
      JOIN posts post ON post.id = mapping.post_id
      JOIN view_public_post_eligibility eligibility ON eligibility.post_id = post.id
      WHERE post.post_type = 'data_point'
      GROUP BY mapping.topic_id
    ),
    news_counts AS (
      SELECT category.topic_id, COUNT(DISTINCT item.id)::bigint AS count
      FROM requested_topic_ids requested
      JOIN rss_feed_item_categories category ON category.topic_id = requested.id
      JOIN rss_feed_items item ON item.id = category.rss_feed_item_id
      JOIN rss_feed_item_sources source ON source.rss_feed_item_id = item.id
      JOIN rss_feeds feed ON feed.id = source.rss_feed_id
      JOIN view_rss_feed_current_states current_state ON current_state.rss_feed_id = feed.id
      WHERE item.deleted_at IS NULL
        AND feed.deleted_at IS NULL
        AND current_state.is_enabled = TRUE
        AND current_state.is_discoverable = TRUE
      GROUP BY category.topic_id
    ),
    latest_counts AS (
      SELECT feed.topic_id, COUNT(DISTINCT item.id)::bigint AS count
      FROM requested_topic_ids requested
      JOIN rss_feeds feed ON feed.topic_id = requested.id
      JOIN rss_feed_item_sources source ON source.rss_feed_id = feed.id
      JOIN rss_feed_items item ON item.id = source.rss_feed_item_id
      JOIN view_rss_feed_current_states current_state ON current_state.rss_feed_id = feed.id
      WHERE feed.deleted_at IS NULL
        AND current_state.is_enabled = TRUE
        AND current_state.is_discoverable = TRUE
        AND item.deleted_at IS NULL
      GROUP BY feed.topic_id
    )
    SELECT
      topic_metrics.topic_id AS id,
      COALESCE(discussion_counts.count, 0)::bigint AS count__discussions,
      COALESCE(review_counts.count, 0)::bigint AS count__reviews,
      COALESCE(data_point_counts.count, 0)::bigint AS count__data_points,
      COALESCE(news_counts.count, 0)::bigint AS count__news,
      COALESCE(latest_counts.count, 0)::bigint AS count__latest,
      topic_metrics.ratings__count__1,
      topic_metrics.ratings__count__2,
      topic_metrics.ratings__count__3,
      topic_metrics.ratings__count__4,
      topic_metrics.ratings__count__5,
      topic_metrics.ratings__updated_at,
      topic_metrics.bookmarks__follow_count,
      topic_metrics.bookmarks__updated_at,
      combined_ids.input_order
    FROM combined_ids
    JOIN topic_metrics ON topic_metrics.topic_id = combined_ids.id
    LEFT JOIN discussion_counts ON discussion_counts.topic_id = combined_ids.id
    LEFT JOIN review_counts ON review_counts.topic_id = combined_ids.id
    LEFT JOIN data_point_counts ON data_point_counts.topic_id = combined_ids.id
    LEFT JOIN news_counts ON news_counts.topic_id = combined_ids.id
    LEFT JOIN latest_counts ON latest_counts.topic_id = combined_ids.id
    ORDER BY combined_ids.input_order
  `
}
