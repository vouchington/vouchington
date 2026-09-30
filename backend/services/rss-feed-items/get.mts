import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { ViewRssFeedItem } from './types.mts'

/**
 * Get RSS feed item by UUIDv7 id.
 */
export async function getRssFeedItemById(
  id: string,
  options: QueryOptions = {},
): Promise<ViewRssFeedItem | null> {
  const {
    rows: [item],
  } = await read(
    sql`/* getRssFeedItemById */
    SELECT *
    FROM view_rss_feed_items
    WHERE id = ${id}
    LIMIT 1
  `,
    options,
  )

  if (!item) return null

  return item as ViewRssFeedItem
}

/**
 * Looks up an RSS feed item ID by GUID without scoping by hostname.
 * Returns an arbitrary match when the same GUID exists across multiple hostnames.
 * For use in tests only — production code should scope by (url_hostname_id, guid).
 */
export async function getRssFeedItemKeyByGuid(
  guid: string,
  options: QueryOptions = {},
): Promise<{ id: string } | null> {
  const { rows } = await read(
    sql`/* getRssFeedItemKeyByGuid */
      SELECT id FROM rss_feed_item_ids WHERE guid = ${guid} LIMIT 1
    `,
    options,
  )
  if (!rows[0]) return null
  return { id: rows[0].id as string }
}
