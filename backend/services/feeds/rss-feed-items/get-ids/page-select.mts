import sql, { type SQLStatement } from 'sql-template-strings'

/** Apply the strict delivery cursor after bounded candidates have chosen their story winners. */
export function appendFeedPageSelect(
  query: SQLStatement,
  { idLt, sortAtLt, safeLimit }: { idLt?: string; sortAtLt?: string; safeLimit: number },
): SQLStatement {
  query.append(sql`
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
    WHERE 1 = 1`)
  if (idLt && sortAtLt)
    query.append(sql`
      AND (combined_rss_feed_items.sort_at, combined_rss_feed_items.result_id::uuid)
        < (${sortAtLt}::timestamptz, ${idLt}::uuid)`)
  return query.append(sql`
    ORDER BY combined_rss_feed_items.sort_at DESC,
      combined_rss_feed_items.result_id::uuid DESC
    LIMIT ${safeLimit + 1}`)
}
