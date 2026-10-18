import { jobSerializationPool, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Pool occupancy for the RSS import row-lock concurrency regression. */
export function getRssFeedImportSerializationPoolForTest(): { capacity: number; idle: number } {
  const capacity = jobSerializationPool.options.max
  if (capacity === undefined) throw new Error('RSS import serialization pool has no maximum')
  return { capacity, idle: jobSerializationPool.idleCount }
}

/** The row ids of a user RSS feed import, in input order. */
export async function getRssFeedImportRowIds(importId: string): Promise<string[]> {
  const { rows } = await write(
    sql`/* getRssFeedImportRowIds */
      SELECT id
      FROM user_rss_feed_import_rows
      WHERE batch_id = ${importId}
      ORDER BY row_index
    `,
  )
  return (rows as Array<{ id: string }>).map(row => row.id)
}

/** The first row id of a user RSS feed import. */
export async function getFirstRssFeedImportRowId(importId: string): Promise<string> {
  const [rowId] = await getRssFeedImportRowIds(importId)
  if (!rowId) throw new Error(`Import ${importId} has no rows`)
  return rowId
}

export async function getRssFeedImportDiscoveryForTest(rowId: string): Promise<{
  discovered_feed_url: string | null
  discovery_crawl_id: string | null
  discovery_url_id: string | null
  discovery_generation: string | null
}> {
  const { rows } = await write<{
    discovered_feed_url: string | null
    discovery_crawl_id: string | null
    discovery_url_id: string | null
    discovery_generation: string | null
  }>(
    sql`/* getRssFeedImportDiscoveryForTest */
      SELECT discovered.url AS discovered_feed_url, import_row.discovery_crawl_id,
        import_row.discovery_url_id, import_row.discovery_generation
      FROM user_rss_feed_import_rows import_row
      LEFT JOIN urls discovered ON discovered.id = import_row.discovered_feed_url_id
      WHERE import_row.id = ${rowId}`,
  )
  if (!rows[0]) throw new Error(`Import row ${rowId} not found`)
  return rows[0]
}

export async function getRssFeedUrlForTest(rssFeedId: string): Promise<string | null> {
  const { rows } = await write<{ url: string }>(sql`/* getRssFeedUrlForTest */
    SELECT u.url FROM rss_feeds rf JOIN urls u ON u.id = rf.rss_feed_url_id
    WHERE rf.id = ${rssFeedId}`)
  return rows[0]?.url ?? null
}
