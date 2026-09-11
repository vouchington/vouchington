import { ValkeyBloomFilter, bloomValkeyClient } from '@data-stores/valkey'
import { createAsyncGeneratorFromCursor, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { normalizeDomain } from './domains.mts'
import { enqueueRebuildBloomFilter } from '@queues/bloom-filters/enqueues'
import { enqueueRebuildBloomFilterBestEffort } from './rebuild-enqueue.mts'
import { newBloomReadyMarkerValue, unlinkReadyMarkerIfValue } from './ready-marker.mts'
import {
  checkBloomFilterRead,
  isUnavailableLiveFilterKey,
  repairBloomFilterUnavailableRead,
} from './read-repair.mts'
import onError from '@modules/on-error'
import { warmUpBlocklistBloomFilter } from './warmup-orchestration.mts'
import { withBlocklistBloomFilterLock } from './bloom-filter-lock.mts'

const BATCH_SIZE = 10_000

const bloomFilter = new ValkeyBloomFilter({
  name: 'url-blocklist',
  capacity: 5_000_000,
  errorRate: 0.01,
  batchSize: BATCH_SIZE,
  // ~5M domains rebuilt in the bloom-filters worker: cap in-flight chunks to limit Valkey pressure
  concurrencyLimit: 8,
  client: bloomValkeyClient,
})

// Marker key set after each successful rebuild — used by warmup as a reliable
// readiness check instead of a bloom membership probe (which can false-positive).
const BLOOM_READY_KEY = 'bloom-filter:url-blocklist:ready'
type ReadyMarkerValue = Exclude<Awaited<ReturnType<typeof bloomValkeyClient.get>>, null>

export async function invalidateUrlBlocklistReadyMarker(): Promise<number> {
  return Number(await bloomValkeyClient.unlink([BLOOM_READY_KEY]))
}

async function enqueueRebuildAndInvalidateReadyMarker(
  waitForEnqueue = true,
  observedReadyValue?: ReadyMarkerValue,
): Promise<void> {
  try {
    const readyValue =
      observedReadyValue ?? (await getReadyMarkerValueForUrlBlocklistInvalidation())
    if (readyValue === null) return

    if (!waitForEnqueue) {
      enqueueRebuildBloomFilterBestEffort('url-blocklist', () =>
        unlinkReadyMarkerIfValue(BLOOM_READY_KEY, readyValue),
      )
      return
    }
    await enqueueRebuildBloomFilter({ filter: 'url-blocklist' })
    await unlinkReadyMarkerIfValue(BLOOM_READY_KEY, readyValue)
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
  }
}

async function getReadyMarkerValueForUrlBlocklistInvalidation(): Promise<ReadyMarkerValue | null> {
  try {
    return await bloomValkeyClient.get(BLOOM_READY_KEY)
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
    await repairUrlBlocklistUnavailableRead()
    return null
  }
}

async function repairStaleReadyMarkerIfFilterUnavailable(): Promise<void> {
  try {
    const readyValue = await bloomValkeyClient.get(BLOOM_READY_KEY)
    if (readyValue === null) return

    if (await isUnavailableLiveFilterKey(bloomFilter.getConfig().liveKey)) {
      await enqueueRebuildAndInvalidateReadyMarker(false, readyValue)
      await unlinkReadyMarkerIfValue(BLOOM_READY_KEY, readyValue)
    }
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
  }
}

export async function enqueueUrlBlocklistRebuild(): Promise<void> {
  try {
    await enqueueRebuildBloomFilter({ filter: 'url-blocklist' })
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
  }
}

export async function checkBloomFilter(hostname: string): Promise<boolean | null> {
  return checkBloomFilterRead({
    readyKey: BLOOM_READY_KEY,
    value: hostname,
    liveKey: bloomFilter.getConfig().liveKey,
    existsIfReady: (readyKey, value) => bloomFilter.existsIfReady(readyKey, value),
    repairUnavailableRead: repairUrlBlocklistUnavailableRead,
  })
}

export async function addDomainsToBloomFilter(domains: string[]): Promise<void> {
  const validDomains = domains.flatMap(d => {
    const n = normalizeDomain(d)
    return n !== null ? [n] : []
  })

  try {
    await bloomFilter.addOrThrow(validDomains)
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
    await enqueueRebuildAndInvalidateReadyMarker()
  }
}

async function* urlBlocklistBatchesFromDb(): AsyncGenerator<string[]> {
  let batch: string[] = []

  for await (const row of createAsyncGeneratorFromCursor<{ domain: string }>(
    sql`/* urlBlocklistBatchesFromDb */
      SELECT db.domain
      FROM domain_blacklists db
      INNER JOIN domain_blacklist_sources dbs ON dbs.id = db.source_id
      WHERE dbs.type = 'url'::domain_blacklist_types
    `,
    { batchSize: BATCH_SIZE },
  )) {
    batch.push(row.domain)
    if (batch.length >= BATCH_SIZE) {
      yield batch.splice(0, BATCH_SIZE)
    }
  }

  if (batch.length > 0) {
    yield batch
    batch = []
  }

  for await (const row of createAsyncGeneratorFromCursor<{ hostname: string }>(
    sql`/* urlBlocklistBatchesFromDb */ SELECT hostname FROM url_hostnames WHERE blocked = TRUE OR crawlable = FALSE`,
    { batchSize: BATCH_SIZE },
  )) {
    batch.push(row.hostname)
    if (batch.length >= BATCH_SIZE) {
      yield batch.splice(0, BATCH_SIZE)
    }
  }

  if (batch.length > 0) {
    yield batch
  }
}

export async function rebuildBloomFilter(): Promise<void> {
  await withBlocklistBloomFilterLock('url-blocklist', async () => {
    await bloomFilter.rebuildFromStream(urlBlocklistBatchesFromDb())
    await bloomValkeyClient.set(BLOOM_READY_KEY, newBloomReadyMarkerValue())
  })
}

export async function warmUpUrlBlocklistBloomFilter(): Promise<void> {
  await warmUpBlocklistBloomFilter({
    hasData: hasUrlBlocklistData,
    isReady: () => bloomFilter.isReady(BLOOM_READY_KEY),
    enqueueRebuild: enqueueUrlBlocklistRebuild,
  })
}

export async function deleteBloomFilter(): Promise<void> {
  await withBlocklistBloomFilterLock('url-blocklist', () =>
    bloomFilter.deleteWithAdditionalKeys([BLOOM_READY_KEY]),
  )
}

async function repairUrlBlocklistUnavailableRead(): Promise<void> {
  await repairBloomFilterUnavailableRead({
    filter: 'url-blocklist',
    readyKey: BLOOM_READY_KEY,
    repairStaleReadyMarker: repairStaleReadyMarkerIfFilterUnavailable,
  })
}

async function hasUrlBlocklistData(): Promise<boolean> {
  const { rows } = await read(sql`/* warmUpUrlBlocklistBloomFilter */
    SELECT 1 FROM domain_blacklists db
    INNER JOIN domain_blacklist_sources dbs ON dbs.id = db.source_id
    WHERE dbs.type = 'url'::domain_blacklist_types
    LIMIT 1
  `)
  return rows.length > 0
}
