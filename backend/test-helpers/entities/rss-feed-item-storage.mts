import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getRssFeedItemStorageStateForTest(itemId: string): Promise<{
  identity_exists: boolean
  content_exists: boolean
  storage_table: string | null
  view_guid: string | null
  view_url_hostname_id: string | null
  deleted_at: Date | null
}> {
  const { rows } = await read<{
    identity_exists: boolean
    content_exists: boolean
    storage_table: string | null
    view_guid: string | null
    view_url_hostname_id: string | null
    deleted_at: Date | null
  }>(sql`/* getRssFeedItemStorageStateForTest */
    SELECT
      EXISTS (SELECT 1 FROM rss_feed_item_ids WHERE id = ${itemId}) AS identity_exists,
      EXISTS (SELECT 1 FROM rss_feed_items WHERE id = ${itemId}) AS content_exists,
      (SELECT tableoid::regclass::text FROM rss_feed_items WHERE id = ${itemId}) AS storage_table,
      (SELECT guid FROM view_rss_feed_items WHERE id = ${itemId}) AS view_guid,
      (
        SELECT url_hostname_id
        FROM view_rss_feed_items
        WHERE id = ${itemId}
      ) AS view_url_hostname_id,
      (SELECT deleted_at FROM rss_feed_items WHERE id = ${itemId}) AS deleted_at
  `)
  return rows[0]!
}

export async function getRssFeedItemPartitionNamesForTest(): Promise<string[]> {
  const { rows } = await read<{ partition_name: string }>(`/* getRssFeedItemPartitionNamesForTest */
    SELECT child.relname AS partition_name
    FROM pg_inherits
    JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
    JOIN pg_class child ON child.oid = pg_inherits.inhrelid
    WHERE parent.relname = 'rss_feed_items'
    ORDER BY child.relname
  `)
  return rows.map(row => row.partition_name)
}

export async function deleteRssFeedUrlHostnameForTest(feedId: string): Promise<void> {
  await write(sql`/* deleteRssFeedUrlHostnameForTest */
    DELETE FROM url_hostnames
    WHERE id = (
      SELECT urls.hostname_id
      FROM rss_feeds
      JOIN urls ON urls.id = rss_feeds.rss_feed_url_id
      WHERE rss_feeds.id = ${feedId}
    )
  `)
}
