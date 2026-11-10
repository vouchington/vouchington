import { topicCountLaterals } from './metrics-batch-post-counts.mts'
import { topicResolutionCtes } from './metrics-batch-topic-resolution.mts'

export function buildTopicMetricsBatchQuery(inputCtes: string, probeParam: string): string {
  return `${inputCtes},${topicResolutionCtes()}${topicMetricsSelectSql(probeParam)}`
}

function topicMetricsSelectSql(probeParam: string): string {
  return `
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
    ${topicCountLaterals(probeParam)}
    ORDER BY combined_ids.input_order
  `
}
