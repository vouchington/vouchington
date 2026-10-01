import { read, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { itemHasDiscoverableSourceSql } from '@modules/feed-query-builders/discoverability-sql'

/**
 * Whether any of this item's source feeds are currently enabled and discoverable. An item can
 * have multiple source feeds via rss_feed_item_sources, which is why this checks the join rather
 * than reading a single rss_feeds.is_discoverable column.
 */
export async function isRssFeedItemFromDiscoverableSource(
  rssFeedItemId: string,
  query: QueryExecutor = read,
): Promise<boolean> {
  const statement = sql`/* isRssFeedItemFromDiscoverableSource */
    SELECT EXISTS (
      SELECT 1
      FROM rss_feed_items item
      WHERE item.id = ${rssFeedItemId}
        AND `
  statement.append(itemHasDiscoverableSourceSql('item.id'))
  statement.append(sql`
    ) AS is_discoverable
  `)

  const { rows } = await query(statement)
  return Boolean((rows[0] as { is_discoverable?: boolean } | undefined)?.is_discoverable)
}
