import { read } from '@data-stores/psql'

export async function getExistingRssFeedUrls(): Promise<Set<string>> {
  const { rows } = await read(`/* getExistingRssFeedUrls */
    SELECT urls.url
    FROM rss_feeds
    JOIN urls ON urls.id = rss_feeds.rss_feed_url_id
    WHERE rss_feeds.deleted_at IS NULL
  `)

  return new Set(rows.map(row => row.url as string))
}
