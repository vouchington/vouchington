import sql, { type SQLStatement } from 'sql-template-strings'
import {
  appendDirectCandidateFilters,
  type DirectCandidateFilterOptions,
} from './direct-candidate-cte.mts'

export function appendPaginationCTEs(
  query: SQLStatement,
  {
    itemIdLt,
    publishedLt,
    safeLimit,
    shareEventIdLt,
    directCandidateFilters,
  }: {
    directCandidateFilters: DirectCandidateFilterOptions
    itemIdLt?: string
    publishedLt?: number
    safeLimit: number
    shareEventIdLt?: string
  },
): SQLStatement {
  query.append(sql`,
    canonical_rss_feed_items AS (
      SELECT combined_rss_feed_items.*
      FROM combined_rss_feed_items
      LEFT JOIN stories
        ON stories.id = combined_rss_feed_items.story_id
        AND stories.deleted_at IS NULL
      WHERE combined_rss_feed_items.delivery_type = 'share'
        OR NOT EXISTS (
          SELECT 1
          FROM rss_feed_items better_rss_feed_item
          LEFT JOIN stories better_story
            ON better_story.id = better_rss_feed_item.story_id
            AND better_story.deleted_at IS NULL
          WHERE better_rss_feed_item.story_id = combined_rss_feed_items.story_id
  `)
  query.append(sql` AND `)
  appendDirectCandidateFilters(query, directCandidateFilters, {
    rssFeedItemId: sql`better_rss_feed_item.id`,
    rssFeedItemTable: sql`better_rss_feed_item`,
    rssFeedItemUrlId: sql`better_rss_feed_item.url_id`,
    rssFeedItemVotes: sql`better_rss_feed_item.votes_score_net`,
  })
  query.append(sql`
            AND (
              CASE WHEN better_story.official_rss_feed_item_id = better_rss_feed_item.id THEN 1 ELSE 0 END,
              COALESCE(better_rss_feed_item.votes_score_net, 0),
              better_rss_feed_item.id
            ) > (
              CASE WHEN stories.official_rss_feed_item_id = combined_rss_feed_items.item_id THEN 1 ELSE 0 END,
              COALESCE(combined_rss_feed_items.votes_score_net, 0),
              combined_rss_feed_items.item_id
            )
        )
    ),
    limited_rss_feed_items_raw AS (
      SELECT canonical_rss_feed_items.*
      FROM canonical_rss_feed_items
      WHERE 1 = 1
  `)
  appendCursorFilter(query, { itemIdLt, publishedLt, shareEventIdLt })
  return query.append(sql`
      ORDER BY
        canonical_rss_feed_items.sort_at DESC,
        canonical_rss_feed_items.sort_rank DESC,
        canonical_rss_feed_items.share_event_id DESC NULLS LAST,
        canonical_rss_feed_items.item_id DESC NULLS LAST
      LIMIT ${safeLimit + 1}
    ),
    rss_feed_items_page_info AS (
      SELECT COUNT(*)::int > ${safeLimit} AS has_next_page
      FROM limited_rss_feed_items_raw
    ),
    limited_rss_feed_items AS (
      SELECT
        limited_rss_feed_items_raw.*,
        rss_feed_items_page_info.has_next_page
      FROM limited_rss_feed_items_raw
      CROSS JOIN rss_feed_items_page_info
      ORDER BY
        limited_rss_feed_items_raw.sort_at DESC,
        limited_rss_feed_items_raw.sort_rank DESC,
        limited_rss_feed_items_raw.share_event_id DESC NULLS LAST,
        limited_rss_feed_items_raw.item_id DESC NULLS LAST
      LIMIT ${safeLimit}
    )`)
}

export function appendFinalSelectCTE(query: SQLStatement): SQLStatement {
  return query.append(sql`
    SELECT
      limited_rss_feed_items.result_id,
      limited_rss_feed_items.entity_id,
      limited_rss_feed_items.published_at,
      limited_rss_feed_items.sort_at,
      limited_rss_feed_items.story_id,
      limited_rss_feed_items.delivery_type,
      limited_rss_feed_items.shared_by_user_id,
      limited_rss_feed_items.shared_at,
      limited_rss_feed_items.item_id,
      limited_rss_feed_items.share_event_id,
      rss_feed_items_page_info.has_next_page
    FROM limited_rss_feed_items
    CROSS JOIN rss_feed_items_page_info
    ORDER BY
      limited_rss_feed_items.sort_at DESC,
      limited_rss_feed_items.sort_rank DESC,
      limited_rss_feed_items.share_event_id DESC NULLS LAST,
      limited_rss_feed_items.item_id DESC NULLS LAST
  `)
}

function appendCursorFilter(
  query: SQLStatement,
  {
    itemIdLt,
    publishedLt,
    shareEventIdLt,
  }: {
    itemIdLt?: string
    publishedLt?: number
    shareEventIdLt?: string
  },
): void {
  if (publishedLt === undefined) return
  if (shareEventIdLt) {
    query.append(sql`
        AND (
          canonical_rss_feed_items.sort_at < to_timestamp(${publishedLt / 1000.0})
          OR (
            canonical_rss_feed_items.sort_at = to_timestamp(${publishedLt / 1000.0})
            AND (
              canonical_rss_feed_items.sort_rank < 1
              OR (
                canonical_rss_feed_items.sort_rank = 1
                AND canonical_rss_feed_items.share_event_id < ${shareEventIdLt}::uuid
              )
            )
          )
        )
      `)
  } else if (itemIdLt) {
    query.append(sql`
        AND (
          canonical_rss_feed_items.sort_at < to_timestamp(${publishedLt / 1000.0})
          OR (
            canonical_rss_feed_items.sort_at = to_timestamp(${publishedLt / 1000.0})
            AND canonical_rss_feed_items.sort_rank = 0
            AND canonical_rss_feed_items.item_id < ${itemIdLt}::uuid
          )
        )
      `)
  } else {
    query.append(sql`
        AND canonical_rss_feed_items.sort_at < to_timestamp(${publishedLt / 1000.0})
      `)
  }
}
