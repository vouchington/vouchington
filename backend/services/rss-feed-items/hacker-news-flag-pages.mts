import { write } from '@data-stores/psql'

export async function pageRssHackerNewsFlags(
  urlId: string,
  afterId: string,
  upperId: string,
  size: number,
): Promise<string[]> {
  const page = await write<{ id: string }>(
    `/* pageHackerNewsUrlRssItems */ SELECT id FROM rss_feed_items WHERE url_id = $1 AND id > $2 AND id <= $4 ORDER BY id LIMIT $3`,
    [urlId, afterId, size, upperId],
  )
  return page.rows.map(row => row.id)
}

export async function pageRssHackerNewsFlagRepair(afterId: string, upperId: string, size: number) {
  const page = await write<{ id: string }>(
    `/* pageHackerNewsRssFlagRepair */ SELECT id FROM rss_feed_items WHERE id > $1 AND id <= $2 ORDER BY id LIMIT $3`,
    [afterId, upperId, size],
  )
  return page.rows.map(row => row.id)
}
