import sql, { type SQLStatement } from 'sql-template-strings'

/** Apply the strict delivery cursor after bounded candidates have chosen their story winners. */
export function appendFeedPageSelect(
  query: SQLStatement,
  { idLt, sortAtLt, safeLimit }: { idLt?: string; sortAtLt?: string; safeLimit: number },
): SQLStatement {
  query.append(sql`
    , page_rows AS MATERIALIZED (
    SELECT
      combined_rss_feed_items.result_id,
      combined_rss_feed_items.entity_id,
      combined_rss_feed_items.published_at,
      to_char(combined_rss_feed_items.sort_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_sort_at,
      combined_rss_feed_items.story_id,
      combined_rss_feed_items.delivery_type,
      combined_rss_feed_items.shared_by_id,
      combined_rss_feed_items.shared_at
    FROM combined_rss_feed_items
    WHERE NOT EXISTS (
      SELECT 1 FROM page_visibility_boundaries omitted
      WHERE (combined_rss_feed_items.sort_at, combined_rss_feed_items.result_id::uuid)
        < (omitted.sort_at, omitted.item_id)
    )`)
  if (idLt && sortAtLt)
    query.append(sql`
      AND (combined_rss_feed_items.sort_at, combined_rss_feed_items.result_id::uuid)
        < (${sortAtLt}::timestamptz, ${idLt}::uuid)`)
  query.append(sql`
    ORDER BY combined_rss_feed_items.sort_at DESC,
      combined_rss_feed_items.result_id::uuid DESC
    LIMIT ${safeLimit + 1}
    ), page_metadata AS MATERIALIZED (
      SELECT
        to_char(boundary.sort_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
          AS window_floor_sort_at,
        boundary.item_id AS window_floor_id,
        EXISTS (
          SELECT 1 FROM source_item_pool source
          WHERE (source.sort_at, source.item_id) = (boundary.sort_at, boundary.item_id)
        ) OR EXISTS (
          SELECT 1 FROM topic_item_pool topic
          WHERE (topic.sort_at, topic.item_id) = (boundary.sort_at, boundary.item_id)
        ) OR EXISTS (
          SELECT 1 FROM shared_item_pool shared
          WHERE (shared.sort_at, shared.id) = (boundary.sort_at, boundary.item_id)
        ) AS window_floor_seen,
        EXISTS (SELECT 1 FROM omitted_direct_source) AS has_omitted_source,
        (EXISTS (SELECT 1 FROM saturated_direct_child_boundaries) OR
          EXISTS (SELECT 1 FROM saturated_shared_child_boundary)) AS has_saturated_child_pool
      FROM (SELECT 1) anchor
      LEFT JOIN page_visibility_boundaries boundary ON TRUE
    )
    SELECT page_rows.*, page_metadata.window_floor_sort_at,
      page_metadata.window_floor_id, page_metadata.window_floor_seen,
      page_metadata.has_omitted_source, page_metadata.has_saturated_child_pool
    FROM page_metadata
    LEFT JOIN page_rows ON TRUE
    ORDER BY page_rows.cursor_sort_at DESC NULLS LAST, page_rows.result_id::uuid DESC NULLS LAST
    LIMIT ${safeLimit + 1}`)
  return query
}
