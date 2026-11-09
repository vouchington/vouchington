import { topicPostCountCtes } from './metrics-batch-post-counts.mts'
import { topicResolutionCtes } from './metrics-batch-topic-resolution.mts'

export function buildTopicMetricsBatchQuery(inputCtes: string): string {
  return `${inputCtes},${topicResolutionCtes()}${topicPostCountCtes()}${topicMetricsSelectSql()}`
}

function topicMetricsSelectSql(): string {
  return `
    news_counts AS (
      SELECT requested.id AS topic_id, COUNT(*)::bigint AS count
      FROM rss_feed_items item
      CROSS JOIN requested_topic_ids requested
      WHERE item.deleted_at IS NULL
      AND (requested.id, item.id) IN (
        SELECT category.topic_id, category.rss_feed_item_id
        FROM rss_feed_item_categories category
        JOIN requested_topic_ids wanted ON wanted.id = category.topic_id
      )
      AND EXISTS (
        SELECT 1 FROM rss_feed_item_sources source
        WHERE source.rss_feed_item_id = item.id
          -- IS TRUE retains one hashed eligibility set instead of per-source feed probes.
          AND (source.rss_feed_id IN (
            SELECT feed.id FROM rss_feeds feed
            WHERE feed.deleted_at IS NULL AND feed.is_enabled AND feed.is_discoverable
          )) IS TRUE
      )
      GROUP BY requested.id
    ),
    latest_counts AS (
      SELECT feed.topic_id, COUNT(*)::bigint AS count
      FROM rss_feed_item_sources source
      JOIN rss_feed_items item ON item.id = source.rss_feed_item_id
      JOIN rss_feeds feed ON feed.id = source.rss_feed_id
      WHERE feed.topic_id IN (SELECT id FROM requested_topic_ids)
        AND item.deleted_at IS NULL AND feed.deleted_at IS NULL
        AND feed.is_enabled = TRUE AND feed.is_discoverable = TRUE
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
    JOIN LATERAL (
      SELECT
        metrics.topic_id,
        metrics.ratings__count__1,
        metrics.ratings__count__2,
        metrics.ratings__count__3,
        metrics.ratings__count__4,
        metrics.ratings__count__5,
        metrics.ratings__updated_at,
        metrics.bookmarks__follow_count,
        metrics.bookmarks__updated_at
      FROM topic_metrics metrics
      WHERE metrics.topic_id = combined_ids.id
      ORDER BY metrics.topic_id
      LIMIT 1
    ) topic_metrics ON TRUE
    LEFT JOIN discussion_counts ON discussion_counts.topic_id = combined_ids.id
    LEFT JOIN review_counts ON review_counts.topic_id = combined_ids.id
    LEFT JOIN data_point_counts ON data_point_counts.topic_id = combined_ids.id
    LEFT JOIN news_counts ON news_counts.topic_id = combined_ids.id
    LEFT JOIN latest_counts ON latest_counts.topic_id = combined_ids.id
    ORDER BY combined_ids.input_order
  `
}
