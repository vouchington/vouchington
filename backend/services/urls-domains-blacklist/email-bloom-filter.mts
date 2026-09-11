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

const emailBloomFilter = new ValkeyBloomFilter({
  name: 'email-blocklist',
  capacity: 500_000,
  errorRate: 0.01,
  batchSize: BATCH_SIZE,
  client: bloomValkeyClient,
})

// Marker key set after each successful rebuild — used by reads as a reliable
// readiness check instead of a bloom membership probe (which can false-positive).
const BLOOM_READY_KEY = 'bloom-filter:email-blocklist:ready'
type ReadyMarkerValue = Exclude<Awaited<ReturnType<typeof bloomValkeyClient.get>>, null>

export async function invalidateEmailBlocklistReadyMarker(): Promise<number> {
  return Number(await bloomValkeyClient.unlink([BLOOM_READY_KEY]))
}

async function enqueueRebuildAndInvalidateReadyMarker(
  waitForEnqueue = true,
  observedReadyValue?: ReadyMarkerValue,
): Promise<void> {
  try {
    const readyValue =
      observedReadyValue ?? (await getReadyMarkerValueForEmailBlocklistInvalidation())
    if (readyValue === null) return

    if (!waitForEnqueue) {
      enqueueRebuildBloomFilterBestEffort('email-blocklist', () =>
        unlinkReadyMarkerIfValue(BLOOM_READY_KEY, readyValue),
      )
      return
    }
    await enqueueRebuildBloomFilter({ filter: 'email-blocklist' })
    await unlinkReadyMarkerIfValue(BLOOM_READY_KEY, readyValue)
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
  }
}

async function getReadyMarkerValueForEmailBlocklistInvalidation(): Promise<ReadyMarkerValue | null> {
  try {
    return await bloomValkeyClient.get(BLOOM_READY_KEY)
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
    await repairEmailBlocklistUnavailableRead()
    return null
  }
}

async function repairStaleReadyMarkerIfFilterUnavailable(): Promise<void> {
  try {
    const readyValue = await bloomValkeyClient.get(BLOOM_READY_KEY)
    if (readyValue === null) {
      return
    }

    if (await isUnavailableLiveFilterKey(emailBloomFilter.getConfig().liveKey)) {
      await enqueueRebuildAndInvalidateReadyMarker(false, readyValue)
      await unlinkReadyMarkerIfValue(BLOOM_READY_KEY, readyValue)
    }
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
  }
}

export async function enqueueEmailBlocklistRebuild(): Promise<void> {
  try {
    await enqueueRebuildBloomFilter({ filter: 'email-blocklist' })
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
  }
}

/**
 * Check if a domain might be in the email blocklist bloom filter.
 * Returns `true` (maybe present), `false` (definitely not present),
 * or `null` (filter doesn't exist or connection error — caller should fall back to DB).
 */
export async function checkEmailBloomFilter(domain: string): Promise<boolean | null> {
  return checkBloomFilterRead({
    readyKey: BLOOM_READY_KEY,
    value: domain,
    liveKey: emailBloomFilter.getConfig().liveKey,
    existsIfReady: (readyKey, value) => emailBloomFilter.existsIfReady(readyKey, value),
    repairUnavailableRead: repairEmailBlocklistUnavailableRead,
  })
}

/**
 * Add domains to the email bloom filter. Returns a Promise — errors are logged, not thrown.
 * Only adds items that pass domain format validation.
 * If the filter is absent, addOrThrow() is a no-op and reads keep falling back
 * until a completed rebuild sets the ready marker.
 */
export async function addDomainsToEmailBloomFilter(domains: string[]): Promise<void> {
  const validDomains = domains.flatMap(d => {
    const n = normalizeDomain(d)
    return n !== null ? [n] : []
  })

  try {
    await emailBloomFilter.addOrThrow(validDomains)
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
    await enqueueRebuildAndInvalidateReadyMarker()
  }
}

async function* emailBlocklistBatchesFromDb(): AsyncGenerator<string[]> {
  const batch: string[] = []

  for await (const row of createAsyncGeneratorFromCursor<{ domain: string }>(
    sql`/* emailBlocklistBatchesFromDb */
      SELECT db.domain
      FROM domain_blacklists db
      INNER JOIN domain_blacklist_sources dbs ON dbs.id = db.source_id
      WHERE dbs.type = 'email'::domain_blacklist_types
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
  }
}

export async function rebuildEmailBloomFilter(): Promise<void> {
  await withBlocklistBloomFilterLock('email-blocklist', async () => {
    await emailBloomFilter.rebuildFromStream(emailBlocklistBatchesFromDb())
    await bloomValkeyClient.set(BLOOM_READY_KEY, newBloomReadyMarkerValue())
  })
}

/**
 * Warm up the email blocklist bloom filter on worker startup.
 * Enqueues a rebuild when DB data exists and the completed-rebuild marker is absent.
 * Does not create an empty filter, because an empty ready-looking filter could
 * produce false negatives and skip authoritative blacklist checks.
 */
export async function warmUpEmailBlocklistBloomFilter(): Promise<void> {
  await warmUpBlocklistBloomFilter({
    hasData: hasEmailBlocklistData,
    isReady: () => emailBloomFilter.isReady(BLOOM_READY_KEY),
    enqueueRebuild: enqueueEmailBlocklistRebuild,
  })
}

export async function deleteEmailBloomFilter(): Promise<void> {
  await withBlocklistBloomFilterLock('email-blocklist', () =>
    emailBloomFilter.deleteWithAdditionalKeys([BLOOM_READY_KEY]),
  )
}

async function repairEmailBlocklistUnavailableRead(): Promise<void> {
  await repairBloomFilterUnavailableRead({
    filter: 'email-blocklist',
    readyKey: BLOOM_READY_KEY,
    repairStaleReadyMarker: repairStaleReadyMarkerIfFilterUnavailable,
  })
}

async function hasEmailBlocklistData(): Promise<boolean> {
  const { rows } = await read(sql`/* warmUpEmailBlocklistBloomFilter */
    SELECT db.domain
    FROM domain_blacklists db
    INNER JOIN domain_blacklist_sources dbs ON dbs.id = db.source_id
    WHERE dbs.type = 'email'::domain_blacklist_types
    LIMIT 1
  `)
  return rows.length > 0
}
