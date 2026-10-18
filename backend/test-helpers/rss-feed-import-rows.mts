import { jobSerializationPool, write, type PoolClient } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { randomUUID } from 'node:crypto'
import { getTestPostgresAdvisoryLockHolderProcessId } from './postgres-lock-wait.mts'

const RSS_FEED_IMPORT_ROW_LOCK_NAMESPACE = 0x5252

type ObservedSerializationClient = {
  client: PoolClient
  processId: Promise<number | null>
  disconnected: Promise<Error>
  onError: (error: Error) => void
}

/** Captures and can terminate only the serialization client locking this owned row. */
export function observeRssFeedImportRowLockForTest(rowId: string): {
  terminateAndWait(): Promise<Error>
  close(): void
} {
  const clients: ObservedSerializationClient[] = []
  const onAcquire = (client: PoolClient) => {
    const disconnected = Promise.withResolvers<Error>()
    const onError = (error: Error) => disconnected.resolve(error)
    client.once('error', onError)
    clients.push({
      client,
      processId: client
        .query<{ process_id: number }>(
          '/* observeRssFeedImportRowLockForTest:pid */ SELECT pg_backend_pid()::integer AS process_id',
        )
        .then(result => {
          const processId = result.rows[0]?.process_id
          return processId ?? null
        })
        .catch(() => null),
      disconnected: disconnected.promise,
      onError,
    })
  }
  jobSerializationPool.on('acquire', onAcquire)

  return {
    async terminateAndWait() {
      const { rows: databaseRows } = await write<{ name: string }>(
        '/* observeRssFeedImportRowLockForTest:database */ SELECT current_database() AS name',
      )
      const database = databaseRows[0]?.name
      if (!database) throw new Error('PostgreSQL did not return the current database name')
      const processId = await getTestPostgresAdvisoryLockHolderProcessId({
        namespace: RSS_FEED_IMPORT_ROW_LOCK_NAMESPACE,
        key: `${database}:${rowId}`,
      })
      const observed = await Promise.all(
        clients.map(async candidate => ({ ...candidate, processId: await candidate.processId })),
      )
      const client = observed.find(candidate => candidate.processId === processId)
      if (!client) throw new Error('Could not observe the RSS row-lock connection')
      const termination = await write<{ terminated: boolean }>(
        '/* observeRssFeedImportRowLockForTest:terminate */ SELECT pg_terminate_backend($1) AS terminated',
        [processId],
      )
      if (!termination.rows[0]?.terminated)
        throw new Error('PostgreSQL did not terminate the RSS row-lock connection')
      return client.disconnected
    },
    close() {
      jobSerializationPool.removeListener('acquire', onAcquire)
      for (const { client, onError } of clients) client.removeListener('error', onError)
    },
  }
}

export function getRssFeedImportSerializationPoolForTest(): { capacity: number; idle: number } {
  const capacity = jobSerializationPool.options.max
  if (capacity === undefined) throw new Error('RSS import serialization pool has no maximum')
  return { capacity, idle: jobSerializationPool.idleCount }
}

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

export async function getFirstRssFeedImportRowId(importId: string): Promise<string> {
  const [rowId] = await getRssFeedImportRowIds(importId)
  if (!rowId) throw new Error(`Import ${importId} has no rows`)
  return rowId
}

export async function createRssFeedImportRowForTest(
  userId: string,
  inputUrl: string,
): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createRssFeedImportRowForTest */
    WITH import_batch AS (
      INSERT INTO user_rss_feed_import_batches (user_id, created_via, total_rows)
      VALUES (${userId}, 'web', 1)
      RETURNING id
    )
    INSERT INTO user_rss_feed_import_rows (batch_id, row_index, input_url)
    SELECT import_batch.id, 0, ${inputUrl.trim()} FROM import_batch
    RETURNING id
  `)
  const rowId = rows[0]?.id
  if (!rowId) throw new Error('Could not create RSS import row fixture')
  return rowId
}

export async function deleteOwnedRssFeedImportRowForTest(
  userId: string,
  rowId: string,
): Promise<void> {
  const { rows } = await write<{ id: string }>(sql`/* deleteOwnedRssFeedImportRowForTest */
    DELETE FROM user_rss_feed_import_rows import_row
    USING user_rss_feed_import_batches import_batch
    WHERE import_row.id = ${rowId}
      AND import_row.batch_id = import_batch.id AND import_batch.user_id = ${userId}
    RETURNING import_row.id
  `)
  if (!rows[0]) throw new Error('Could not delete owned RSS import row fixture')
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
