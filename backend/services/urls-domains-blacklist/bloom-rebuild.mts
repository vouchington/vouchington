import { bloomValkeyClient } from '@data-stores/valkey/clients'
import { loadScript, registerScript } from '@data-stores/valkey/scripts'
import {
  beginTransaction,
  readPool,
  write,
  type PoolClient,
  type QueryExecutor,
} from '@data-stores/psql'
import { enqueueRebuildBloomFilter } from '@queues/bloom-filters/enqueues'
import sql from 'sql-template-strings'
import { newBloomReadyMarkerValue } from './ready-marker.mts'

export type BlocklistBloomFilterName = 'url-blocklist' | 'email-blocklist'

const bumpBlocklistBloomGenerationScript = registerScript(
  loadScript('bump-blocklist-bloom-generation.lua', import.meta.url),
)
const publishBlocklistReadyMarkerIfGenerationScript = registerScript(
  loadScript('publish-blocklist-ready-marker-if-generation.lua', import.meta.url),
)

const absentGeneration = '0'
const generationPattern = /^(\d+):(\d+)$/

function blocklistBloomGenerationKey(filter: BlocklistBloomFilterName): string {
  return `bloom-filter:${filter}:generation`
}

export async function bumpBlocklistBloomGeneration(
  filter: BlocklistBloomFilterName,
  visibleThrough?: string,
): Promise<string> {
  const version = visibleThrough ?? (await readPrimaryTransactionId())
  const value = await bloomValkeyClient.invokeScript(bumpBlocklistBloomGenerationScript, {
    keys: [blocklistBloomGenerationKey(filter)],
    args: [version],
  })
  return generationText(value)
}

/** Unlink the ready marker after the bump, including when the bump throws. */
export async function invalidateBlocklistReadyMarker(
  filter: BlocklistBloomFilterName,
  readyKey: string,
): Promise<number> {
  let removed = 0
  try {
    await bumpBlocklistBloomGeneration(filter)
  } finally {
    removed = await bloomValkeyClient.unlink([readyKey])
  }
  return removed
}

async function readBlocklistBloomGeneration(filter: BlocklistBloomFilterName): Promise<string> {
  const value = await bloomValkeyClient.get(blocklistBloomGenerationKey(filter))
  if (value === null) return absentGeneration
  return generationText(value)
}

/**
 * The stored id is the primary transaction that must be visible in this connection's snapshot.
 * The membership stream uses that same transaction, so a lagging reader cannot publish ready.
 */
async function replicaCanSeeBlocklistGeneration(
  generation: string,
  query: QueryExecutor,
): Promise<boolean> {
  const visibleThrough = generationVisibleThrough(generation)
  if (visibleThrough === undefined) return true
  const { rows } = await query<{ visible: boolean }>(
    sql`/* rebuildCurrentBlocklistBloomFilter */
      SELECT pg_visible_in_snapshot(${visibleThrough}::xid8, pg_current_snapshot()) AS visible`,
  )
  return rows[0]?.visible ?? false
}

/** Snapshot the blocklist, then publish ready only when no commit landed after that snapshot. */
export async function rebuildCurrentBlocklistBloomFilter(input: {
  filter: BlocklistBloomFilterName
  readyKey: string
  stream: (client: PoolClient) => Promise<void>
}): Promise<void> {
  const generation = await readBlocklistBloomGeneration(input.filter)
  const streamed = await streamBlocklistOnReplicaSnapshot(generation, input.stream)
  if (!streamed) {
    await enqueueRebuildBloomFilter({ filter: input.filter })
    return
  }
  const published = await publishBlocklistReadyMarkerIfGeneration({
    filter: input.filter,
    readyKey: input.readyKey,
    generation,
    value: newBloomReadyMarkerValue(),
  })
  if (!published) await enqueueRebuildBloomFilter({ filter: input.filter })
}

async function streamBlocklistOnReplicaSnapshot(
  generation: string,
  stream: (client: PoolClient) => Promise<void>,
): Promise<boolean> {
  await using transaction = await beginTransaction({ client: readPool })
  if (!(await blocklistReplicaSnapshotCanStream(transaction, generation))) return false
  await streamVisibleBlocklist(transaction, stream)
  return true
}

async function blocklistReplicaSnapshotCanStream(
  transaction: QueryExecutor,
  generation: string,
): Promise<boolean> {
  await transaction(
    '/* rebuildCurrentBlocklistBloomFilter */ SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
  )
  return replicaCanSeeBlocklistGeneration(generation, transaction)
}

async function streamVisibleBlocklist(
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
  stream: (client: PoolClient) => Promise<void>,
): Promise<void> {
  await stream(transaction.client)
  await transaction.commit()
}

async function publishBlocklistReadyMarkerIfGeneration(input: {
  filter: BlocklistBloomFilterName
  readyKey: string
  generation: string
  value: string
}): Promise<boolean> {
  const published = await bloomValkeyClient.invokeScript(
    publishBlocklistReadyMarkerIfGenerationScript,
    {
      keys: [blocklistBloomGenerationKey(input.filter), input.readyKey],
      args: [input.generation, input.value],
    },
  )
  return Number(published) === 1
}

function generationVisibleThrough(generation: string): string | undefined {
  return generationPattern.exec(generation)?.[2]
}

async function readPrimaryTransactionId(): Promise<string> {
  const { rows } = await write<{ id: string }>(
    sql`/* bumpBlocklistBloomGeneration */ SELECT pg_current_xact_id()::text AS id`,
  )
  const id = rows[0]?.id
  if (!id) throw new Error('PostgreSQL did not return a transaction id')
  return id
}

function generationText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint' || Buffer.isBuffer(value)) {
    return value.toString()
  }
  return absentGeneration
}
