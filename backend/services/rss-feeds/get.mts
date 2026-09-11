import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export const getRssFeedById = async (id: string) => {
  const { rows } = await read(sql`/* getRssFeedById */
    SELECT *
    FROM view_rss_feeds
    WHERE view_rss_feeds.id = ${id}
  `)
  return rows[0] || null
}

export async function getRssFeedByTopicId(
  topicId: string,
): Promise<{ id: string; title: string } | null> {
  const { rows } = await read(sql`/* getRssFeedByTopicId */
    SELECT id, title FROM rss_feeds
    WHERE topic_id = ${topicId}
      AND deleted_at IS NULL
    LIMIT 1
  `)
  return (rows[0] as { id: string; title: string } | undefined) ?? null
}

export async function getRssFeedByUrlId(urlId: string): Promise<{ id: string } | null> {
  const { rows } = await read(sql`/* getRssFeedByUrlId */
    SELECT id FROM rss_feeds
    WHERE rss_feed_url_id = ${urlId}
      AND deleted_at IS NULL
    LIMIT 1
  `)
  return (rows[0] as { id: string } | undefined) ?? null
}

export async function getRssFeedByArticleUrlId(urlId: string): Promise<{ id: string } | null> {
  const { rows } = await read(sql`/* getRssFeedByArticleUrlId */
    SELECT rfis.rss_feed_id AS id
    FROM rss_feed_items rfi
    INNER JOIN rss_feed_item_sources rfis ON rfis.rss_feed_item_id = rfi.id
    INNER JOIN rss_feeds rf ON rf.id = rfis.rss_feed_id
    WHERE rfi.url_id = ${urlId}
      AND rfi.deleted_at IS NULL
      AND rf.deleted_at IS NULL
    ORDER BY rfi.published_at DESC NULLS LAST, rfi.id DESC
    LIMIT 1
  `)
  return (rows[0] as { id: string } | undefined) ?? null
}
