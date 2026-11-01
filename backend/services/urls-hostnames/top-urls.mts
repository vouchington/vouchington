import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getTopUrlsByHostnameIds(hostnameIds: string[]) {
  if (hostnameIds.length === 0) return {}

  const { rows } = await read(sql`/* getTopUrlsByHostnameIds */
    SELECT h.id AS hostname_id, top_urls.id, top_urls.url, top_urls.pathname
    FROM unnest(${[...new Set(hostnameIds)]}::uuid[]) AS h(id)
    CROSS JOIN LATERAL (
      SELECT
        urls.id,
        urls.url,
        urls.pathname,
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
        END AS feed_rank,
        COALESCE((
          SELECT MAX(rss_feed_items.published_at)
          -- no-mistakes-disable-next-line postgres-required-predicates: URL ranking reads item publication times across item-ID partitions; URL assignment may change
          FROM rss_feed_items
          WHERE rss_feed_items.url_id = urls.id
        ), to_timestamp(0)) AS latest_published_at
      FROM urls
      WHERE urls.hostname_id = h.id
      ORDER BY feed_rank, latest_published_at DESC, urls.id DESC
      LIMIT 5
    ) top_urls
    ORDER BY h.id ASC, top_urls.feed_rank ASC, top_urls.latest_published_at DESC, top_urls.id DESC
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
