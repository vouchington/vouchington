import { jobSerializationPool, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { randomUUID } from 'node:crypto'

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

export async function getRssFeedImportDiscoveriesForTest(rowId: string): Promise<
  Array<{
    discovery_url_id: string
    discovery_url: string
    discovered_feed_url: string | null
    crawl_id: string | null
    generation: string
    failed_at: Date | null
  }>
> {
  const { rows } = await write<{
    discovery_url_id: string
    discovery_url: string
    discovered_feed_url: string | null
    crawl_id: string | null
    generation: string
    failed_at: Date | null
  }>(
    sql`/* getRssFeedImportDiscoveriesForTest */
      SELECT discovery.discovery_url_id, page.url AS discovery_url,
        discovered.url AS discovered_feed_url,
        discovery.crawl_id, discovery.generation, discovery.failed_at
      FROM user_rss_feed_import_row_discoveries discovery
      JOIN urls page ON page.id = discovery.discovery_url_id
      LEFT JOIN urls discovered ON discovered.id = discovery.discovered_feed_url_id
      WHERE discovery.import_row_id = ${rowId}
      ORDER BY page.url`,
  )
  return rows
}

/** Creates a minimal owned import row with a pending discovery for a real crawler-worker test. */
export async function createPendingRssFeedImportDiscoveryForTest(
  userId: string,
  inputUrl: string,
  discoveryUrlId: string,
): Promise<{ rowId: string; generation: string }> {
  const generation = randomUUID()
  const { rows } = await write<{ row_id: string; generation: string }>(sql`
    /* createPendingRssFeedImportDiscoveryForTest */
    WITH import_batch AS (
      INSERT INTO user_rss_feed_import_batches (user_id, created_via, total_rows)
      VALUES (${userId}, 'web', 1)
      RETURNING id
    ), import_row AS (
      INSERT INTO user_rss_feed_import_rows (batch_id, row_index, input_url)
      SELECT import_batch.id, 0, ${inputUrl}
      FROM import_batch
      RETURNING id
    ), discovery AS (
      INSERT INTO user_rss_feed_import_row_discoveries (
        import_row_id, discovery_url_id, generation
      )
      SELECT import_row.id, ${discoveryUrlId}::uuid, ${generation}::uuid
      FROM import_row
      RETURNING generation
    )
    SELECT import_row.id AS row_id, discovery.generation
    FROM import_row CROSS JOIN discovery
  `)
  const row = rows[0]
  if (!row) throw new Error('Could not create pending RSS feed import discovery fixture')
  return { rowId: row.row_id, generation: row.generation }
}

export async function getRssFeedUrlForTest(rssFeedId: string): Promise<string | null> {
  const { rows } = await write<{ url: string }>(sql`/* getRssFeedUrlForTest */
    SELECT u.url FROM rss_feeds rf JOIN urls u ON u.id = rf.rss_feed_url_id
    WHERE rf.id = ${rssFeedId}`)
  return rows[0]?.url ?? null
}
