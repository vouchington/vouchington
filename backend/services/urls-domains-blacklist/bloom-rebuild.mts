import { bloomValkeyClient } from '@data-stores/valkey/clients'
import { loadScript, registerScript } from '@data-stores/valkey/scripts'
import { beginTransaction, readPool, type PoolClient, type QueryExecutor } from '@data-stores/psql'
import { enqueueRebuildBloomFilter } from '@queues/bloom-filters/enqueues'
import onError from '@modules/on-error'
import sql from 'sql-template-strings'
import {
  blocklistBloomGenerationKey,
  blocklistBloomVisibilityRetriesKey,
  generationIsBeyondPrimary,
  generationVisibleThrough,
  readBlocklistBloomGeneration,
  replaceStaleBlocklistBloomGeneration,
  type BlocklistBloomFilterName,
} from './bloom-generation.mts'
import { newBloomReadyMarkerValue } from './ready-marker.mts'
import { getUrlsDomainsBlacklistWorkLimit } from './work-limits.mts'

const publishBlocklistReadyMarkerIfGenerationScript = registerScript(
  loadScript('publish-blocklist-ready-marker-if-generation.lua', import.meta.url),
)

/** The counter outlives a stuck rebuild by at most this long, then expires on its own. */
const visibilityRetriesTtlSeconds = 3_600

type SnapshotOutcome = 'streamed' | 'not-visible'

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
  const outcome = await streamBlocklistOnReplicaSnapshot(generation, input.stream)
  if (outcome === 'not-visible') {
    await retryWhenGenerationNotVisible(input.filter, generation)
    return
  }
  await bloomValkeyClient.unlink([blocklistBloomVisibilityRetriesKey(input.filter)])
  const published = await publishBlocklistReadyMarkerIfGeneration({
    filter: input.filter,
    readyKey: input.readyKey,
    generation,
    value: newBloomReadyMarkerValue(),
  })
  if (!published) await enqueueRebuildBloomFilter({ filter: input.filter })
}

/**
 * A generation beyond the primary can never become visible, so it is replaced from the primary's
 * current id. Otherwise the replica is only behind: retry, but only as many times as the cap.
 */
async function retryWhenGenerationNotVisible(
  filter: BlocklistBloomFilterName,
  generation: string,
): Promise<void> {
  if (await generationIsBeyondPrimary(generation)) {
    await replaceStaleBlocklistBloomGeneration(filter, generation)
    await enqueueRebuildBloomFilter({ filter })
    return
  }
  const retriesKey = blocklistBloomVisibilityRetriesKey(filter)
  const retries = await bloomValkeyClient.incr(retriesKey)
  await bloomValkeyClient.expire(retriesKey, visibilityRetriesTtlSeconds)
  if (retries > getUrlsDomainsBlacklistWorkLimit('blocklist_bloom_visibility_retries')) {
    await bloomValkeyClient.unlink([retriesKey])
    onError(new Error(`${filter} rebuild gave up: replica never saw generation ${generation}`))
    return
  }
  await enqueueRebuildBloomFilter({ filter })
}

async function streamBlocklistOnReplicaSnapshot(
  generation: string,
  stream: (client: PoolClient) => Promise<void>,
): Promise<SnapshotOutcome> {
  await using transaction = await beginTransaction({ client: readPool })
  if (!(await blocklistReplicaSnapshotCanStream(transaction, generation))) return 'not-visible'
  await streamVisibleBlocklist(transaction, stream)
  return 'streamed'
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
