import { read } from '@data-stores/psql'

export type RssFeedReference = { id: string; slug: null }

export type RssFeedReferenceLookup = {
  ids: readonly string[]
  idOrders: readonly number[]
  urls: readonly string[]
  urlOrders: readonly number[]
  urlPriorities: readonly number[]
}

/** Id or URL references in one statement. Canonical feeds win one level. Lower priority loses. */
export async function getRssFeedsByReferenceBatch(
  lookup: RssFeedReferenceLookup,
  count: number,
): Promise<Array<RssFeedReference | null>> {
  const results: Array<RssFeedReference | null> = Array.from({ length: count }, () => null)
  if (lookup.ids.length + lookup.urls.length === 0) return results
  const { rows } = await read<{ id: string; input_order: number }>(
    `/* getRssFeedsByReferenceBatch */
    WITH id_input AS (
      SELECT unnest($1::uuid[]) AS id, unnest($2::int[]) AS input_order
    ),
    url_input AS (
      SELECT unnest($3::text[]) AS url,
             unnest($4::int[]) AS input_order,
             unnest($5::int[]) AS priority
    ),
    id_hits AS (
      SELECT COALESCE(canonical.id, feed.id) AS id, id_input.input_order, 0 AS priority
      FROM rss_feeds feed
      LEFT JOIN rss_feeds canonical
        ON canonical.id = feed.canonical_rss_feed_id AND canonical.deleted_at IS NULL
      JOIN id_input ON feed.id = id_input.id
      WHERE feed.deleted_at IS NULL
    ),
    url_hits AS (
      SELECT COALESCE(canonical.id, feed.id) AS id, url_input.input_order, url_input.priority
      FROM rss_feeds feed
      JOIN urls url ON url.id = feed.rss_feed_url_id
      LEFT JOIN rss_feeds canonical
        ON canonical.id = feed.canonical_rss_feed_id AND canonical.deleted_at IS NULL
      JOIN url_input ON url.url = url_input.url
      WHERE feed.deleted_at IS NULL
    ),
    chosen AS (
      SELECT DISTINCT ON (input_order) id, input_order
      FROM (
        SELECT id, input_order, priority FROM id_hits
        UNION ALL
        SELECT id, input_order, priority FROM url_hits
      ) hits
      ORDER BY input_order, priority, id
    )
    SELECT id, input_order FROM chosen`,
    [lookup.ids, lookup.idOrders, lookup.urls, lookup.urlOrders, lookup.urlPriorities],
  )
  for (const row of rows) results[row.input_order] = { id: row.id, slug: null }
  return results
}
