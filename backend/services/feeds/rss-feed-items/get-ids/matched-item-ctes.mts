import sql, { type SQLStatement } from 'sql-template-strings'
import type { RssFeedItemFeedType } from '../../types.mts'
import { buildSourceHead } from './source-head.mts'

export function appendMatchedItemCTEs(
  query: SQLStatement,
  {
    feedType,
    itemCutoffId,
    sourceLimit,
    pageSize,
    cutoffDate,
    cursorSortAt,
    cursorId,
    cursorInclusive,
  }: {
    feedType: RssFeedItemFeedType | undefined
    itemCutoffId: string | null
    sourceLimit: number
    pageSize: number
    cutoffDate: Date | null
    cursorSortAt?: string
    cursorId?: string
    cursorInclusive?: boolean
  },
): void {
  query.append(sql`, active_rss_feed_sources AS MATERIALIZED (
    SELECT 'feed'::text AS source_kind, followed.rss_feed_id AS source_id,
      head.sort_at AS activity_at, head.item_id AS activity_item_id
    FROM followed_rss_feeds followed
    CROSS JOIN LATERAL (
      SELECT id FROM rss_feeds WHERE id = followed.rss_feed_id
        AND deleted_at IS NULL AND is_enabled = TRUE
        AND latest_item_sort_at IS NOT NULL LIMIT 1
    ) live_feed
    CROSS JOIN LATERAL (`)
  query.append(
    buildSourceHead(
      'feed',
      sql`live_feed.id`,
      cursorSortAt,
      cursorId,
      cursorInclusive,
      cutoffDate,
      itemCutoffId,
    ),
  )
  query.append(sql`) head
    WHERE ${feedType !== 'follow_topics'}
    ORDER BY head.sort_at DESC, head.item_id DESC, followed.rss_feed_id DESC
    LIMIT ${sourceLimit + 1}
  ), active_topic_sources AS MATERIALIZED (
    SELECT 'topic'::text AS source_kind, followed.topic_id AS source_id,
      head.sort_at AS activity_at, head.item_id AS activity_item_id
    FROM followed_topics followed
    CROSS JOIN LATERAL (`)
  query.append(
    buildSourceHead(
      'topic',
      sql`followed.topic_id`,
      cursorSortAt,
      cursorId,
      cursorInclusive,
      cutoffDate,
      itemCutoffId,
    ),
  )
  query.append(sql`) head
    WHERE ${feedType !== 'follow_rss_feeds'}
    ORDER BY head.sort_at DESC, head.item_id DESC, followed.topic_id DESC
    LIMIT ${sourceLimit + 1}
  ), ranked_direct_sources AS MATERIALIZED (
    SELECT source_kind, source_id, activity_at, activity_item_id,
      row_number() OVER (
        ORDER BY activity_at DESC, activity_item_id DESC, source_id DESC, source_kind DESC
      ) AS source_rank
    FROM (
      SELECT * FROM active_rss_feed_sources
      UNION ALL
      SELECT * FROM active_topic_sources
    ) active_sources
  ), selected_direct_sources AS MATERIALIZED (
    SELECT source_kind, source_id FROM ranked_direct_sources
    WHERE source_rank <= ${sourceLimit}
  ), omitted_direct_source AS MATERIALIZED (
    SELECT activity_at AS sort_at, activity_item_id AS item_id
    FROM ranked_direct_sources WHERE source_rank = ${sourceLimit + 1}
    UNION ALL
    SELECT sort_at, item_id FROM omitted_proxy_rss_feed_source
    WHERE ${feedType !== 'follow_topics'}
    UNION ALL
    SELECT sort_at, item_id FROM omitted_proxy_topic_source
    WHERE ${feedType !== 'follow_rss_feeds'}
  ), source_item_pool AS MATERIALIZED (
    SELECT selected.source_id, source.rss_feed_item_id AS item_id, source.item_sort_at AS sort_at
    FROM selected_direct_sources selected
    CROSS JOIN LATERAL (
      SELECT source.rss_feed_item_id, source.item_sort_at
      FROM rss_feed_item_sources source
      WHERE source.rss_feed_id = selected.source_id
        AND source.item_sort_at IS NOT NULL`)
  if (cursorSortAt && cursorId)
    query.append(
      cursorInclusive
        ? sql` AND (source.item_sort_at, source.rss_feed_item_id)
        <= (${cursorSortAt}::timestamptz, ${cursorId}::uuid)`
        : sql` AND (source.item_sort_at, source.rss_feed_item_id)
        < (${cursorSortAt}::timestamptz, ${cursorId}::uuid)`,
    )
  if (cutoffDate) query.append(sql` AND source.item_sort_at >= ${cutoffDate}`)
  if (itemCutoffId) query.append(sql` AND source.rss_feed_item_id >= ${itemCutoffId}::uuid`)
  query.append(sql`
      ORDER BY source.item_sort_at DESC, source.rss_feed_item_id DESC
      LIMIT ${pageSize + 1}
    ) source
    WHERE selected.source_kind = 'feed'
  ), topic_item_pool AS MATERIALIZED (
    SELECT selected.source_id, candidate.rss_feed_item_id AS item_id, candidate.sort_at
    FROM selected_direct_sources selected
    CROSS JOIN LATERAL (
      SELECT candidate.rss_feed_item_id, candidate.sort_at
      FROM rss_feed_item_topic_candidates candidate
      WHERE candidate.topic_id = selected.source_id AND candidate.sort_at IS NOT NULL`)
  if (cursorSortAt && cursorId)
    query.append(
      cursorInclusive
        ? sql` AND (candidate.sort_at, candidate.rss_feed_item_id)
        <= (${cursorSortAt}::timestamptz, ${cursorId}::uuid)`
        : sql` AND (candidate.sort_at, candidate.rss_feed_item_id)
        < (${cursorSortAt}::timestamptz, ${cursorId}::uuid)`,
    )
  if (cutoffDate) query.append(sql` AND candidate.sort_at >= ${cutoffDate}`)
  if (itemCutoffId) query.append(sql` AND candidate.rss_feed_item_id >= ${itemCutoffId}::uuid`)
  query.append(sql`
      ORDER BY candidate.sort_at DESC, candidate.rss_feed_item_id DESC
      LIMIT ${pageSize + 1}
    ) candidate
    WHERE selected.source_kind = 'topic'
  ), saturated_direct_child_boundaries AS MATERIALIZED (
    SELECT sort_at, item_id FROM (
      SELECT sort_at, item_id,
        COUNT(*) OVER (PARTITION BY source_id) AS child_count,
        ROW_NUMBER() OVER (
          PARTITION BY source_id ORDER BY sort_at ASC, item_id ASC
        ) AS oldest_rank
      FROM source_item_pool
    ) source_floor
    WHERE child_count >= ${pageSize + 1} AND oldest_rank = 1
    UNION ALL
    SELECT sort_at, item_id FROM (
      SELECT sort_at, item_id,
        COUNT(*) OVER (PARTITION BY source_id) AS child_count,
        ROW_NUMBER() OVER (
          PARTITION BY source_id ORDER BY sort_at ASC, item_id ASC
        ) AS oldest_rank
      FROM topic_item_pool
    ) topic_floor
    WHERE child_count >= ${pageSize + 1} AND oldest_rank = 1
  ), page_visibility_boundaries AS MATERIALIZED (
    SELECT sort_at, item_id FROM (
      SELECT sort_at, item_id FROM omitted_direct_source
      UNION ALL
      SELECT sort_at, item_id FROM saturated_direct_child_boundaries
      UNION ALL
      SELECT sort_at, item_id FROM saturated_shared_child_boundary
    ) boundaries
    ORDER BY sort_at DESC, item_id DESC LIMIT 1
  ), matched_direct_rss_feed_item_guids AS MATERIALIZED (
    SELECT item_id, bool_or(matches_source) AS matches_source,
      bool_or(matches_topics) AS matches_topics
    FROM (
      SELECT item_id, sort_at, true AS matches_source, false AS matches_topics
      FROM source_item_pool
      UNION ALL
      SELECT item_id, sort_at, false AS matches_source, true AS matches_topics
      FROM topic_item_pool
    ) matches
    WHERE NOT EXISTS (
      SELECT 1 FROM page_visibility_boundaries boundary
      WHERE (matches.sort_at, matches.item_id) < (boundary.sort_at, boundary.item_id)
    )
    GROUP BY item_id
  )`)
}
