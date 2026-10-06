import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

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
      SELECT id FROM rss_feed_item_guids WHERE guid = ${guid} LIMIT 1
    `,
    options,
  )
  if (!rows[0]) return null
  return { id: rows[0].id as string }
}
