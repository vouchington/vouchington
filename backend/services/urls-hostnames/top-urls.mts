import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getTopUrlsByHostnameIds(hostnameIds: string[]) {
  if (hostnameIds.length === 0) return {}

  const { rows } = await read(sql`/* getTopUrlsByHostnameIds */
    WITH ranked_urls AS (
      SELECT
        urls.hostname_id,
        urls.id,
        urls.url,
        urls.pathname,
        ROW_NUMBER() OVER (
          PARTITION BY urls.hostname_id
          ORDER BY
            CASE
              WHEN EXISTS (
                SELECT 1
                FROM rss_feeds
                JOIN view_rss_feed_current_states current_state
                  ON current_state.rss_feed_id = rss_feeds.id
                WHERE rss_feeds.rss_feed_url_id = urls.id
                  AND rss_feeds.deleted_at IS NULL
                  AND current_state.is_enabled = TRUE
              ) THEN 0
              ELSE 1
            END,
            COALESCE((
              SELECT MAX(rss_feed_items.published_at)
              FROM rss_feed_items
              WHERE rss_feed_items.url_id = urls.id
            ), to_timestamp(0)) DESC,
            urls.id DESC
        ) AS row_number
      FROM urls
      WHERE urls.hostname_id = ANY(${hostnameIds})
    )
    SELECT hostname_id, id, url, pathname
    FROM ranked_urls
    WHERE row_number <= 5
    ORDER BY hostname_id ASC, row_number ASC
  `)

  const results: Record<string, Array<{ id: string; url: string; pathname: string }>> = {}
  for (const row of rows) {
    const hostnameId = row.hostname_id as string
    if (!results[hostnameId]) results[hostnameId] = []
    results[hostnameId].push({
      id: row.id as string,
      url: row.url as string,
      pathname: row.pathname as string,
    })
  }
  return results
}
