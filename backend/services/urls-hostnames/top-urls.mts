import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export const TOP_URLS_PER_HOSTNAME = 5

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
        urls.feed_rank,
        COALESCE(urls.latest_published_at, '1970-01-01 00:00:00+00'::timestamptz) AS latest_published_at
      FROM urls
      WHERE urls.hostname_id = h.id
      ORDER BY feed_rank, latest_published_at DESC, urls.id DESC
      LIMIT ${TOP_URLS_PER_HOSTNAME}
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
