import sql, { type SQLStatement } from 'sql-template-strings'
import type { RssFeedItemFeedType } from '../../types.mts'

export function appendMatchedItemCTEs(
  query: SQLStatement,
  {
    feedType,
    itemCutoffId,
    sourceLimit,
    itemsPerSource,
    cutoffDate,
  }: {
    feedType: RssFeedItemFeedType | undefined
    itemCutoffId: string | null
    sourceLimit: number
    itemsPerSource: number
    cutoffDate: Date | null
  },
): void {
  query.append(sql`, active_rss_feed_sources AS MATERIALIZED (
    SELECT 'feed'::text AS source_kind, followed.rss_feed_id AS source_id,
      live_feed.latest_item_sort_at AS activity_at
    FROM followed_rss_feeds followed
    CROSS JOIN LATERAL (
      SELECT rss_feeds.id, rss_feeds.latest_item_sort_at
      FROM rss_feeds
      WHERE rss_feeds.id = followed.rss_feed_id
        AND rss_feeds.deleted_at IS NULL AND rss_feeds.is_enabled = TRUE
      LIMIT 1
    ) live_feed
    WHERE 1 = 1
      AND ${feedType !== 'follow_topics'}
    ORDER BY live_feed.latest_item_sort_at DESC NULLS LAST, live_feed.id DESC
    LIMIT ${sourceLimit}
  ), active_topic_sources AS MATERIALIZED (
    SELECT 'topic'::text AS source_kind, followed.topic_id AS source_id,
      latest.sort_at AS activity_at
    FROM followed_topics followed
    LEFT JOIN LATERAL (
      SELECT candidate.sort_at
      FROM rss_feed_item_topic_candidates candidate
      WHERE candidate.topic_id = followed.topic_id AND candidate.sort_at IS NOT NULL
      ORDER BY candidate.sort_at DESC, candidate.rss_feed_item_id DESC
      LIMIT 1
    ) latest ON TRUE
    WHERE ${feedType !== 'follow_rss_feeds'}
    ORDER BY latest.sort_at DESC NULLS LAST, followed.topic_id DESC
    LIMIT ${sourceLimit}
  ), selected_direct_sources AS MATERIALIZED (
    SELECT source_kind, source_id
    FROM (
      SELECT * FROM active_rss_feed_sources
      UNION ALL
      SELECT * FROM active_topic_sources
    ) active_sources
    ORDER BY activity_at DESC NULLS LAST, source_id DESC, source_kind DESC
    LIMIT ${sourceLimit}
  ), source_item_pool AS MATERIALIZED (
    SELECT source.rss_feed_item_id AS item_id
    FROM selected_direct_sources selected
    CROSS JOIN LATERAL (
      SELECT source.rss_feed_item_id
      FROM rss_feed_item_sources source
      WHERE source.rss_feed_id = selected.source_id
        AND source.item_sort_at IS NOT NULL`)
  if (cutoffDate) query.append(sql` AND source.item_sort_at >= ${cutoffDate}`)
  if (itemCutoffId) query.append(sql` AND source.rss_feed_item_id >= ${itemCutoffId}::uuid`)
  query.append(sql`
      ORDER BY source.item_sort_at DESC, source.rss_feed_item_id DESC
      LIMIT ${itemsPerSource}
    ) source
    WHERE selected.source_kind = 'feed'
  ), topic_item_pool AS MATERIALIZED (
    SELECT candidate.rss_feed_item_id AS item_id
    FROM selected_direct_sources selected
    CROSS JOIN LATERAL (
      SELECT candidate.rss_feed_item_id
      FROM rss_feed_item_topic_candidates candidate
      WHERE candidate.topic_id = selected.source_id AND candidate.sort_at IS NOT NULL`)
  if (cutoffDate) query.append(sql` AND candidate.sort_at >= ${cutoffDate}`)
  if (itemCutoffId) query.append(sql` AND candidate.rss_feed_item_id >= ${itemCutoffId}::uuid`)
  query.append(sql`
      ORDER BY candidate.sort_at DESC, candidate.rss_feed_item_id DESC
      LIMIT ${itemsPerSource}
    ) candidate
    WHERE selected.source_kind = 'topic'
  ), matched_direct_rss_feed_item_guids AS MATERIALIZED (
    SELECT item_id, bool_or(matches_source) AS matches_source, bool_or(matches_topics) AS matches_topics
    FROM (
      SELECT item_id, true AS matches_source, false AS matches_topics FROM source_item_pool
      UNION ALL
      SELECT item_id, false AS matches_source, true AS matches_topics FROM topic_item_pool
    ) matches
    GROUP BY item_id
  )`)
}
