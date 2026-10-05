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
