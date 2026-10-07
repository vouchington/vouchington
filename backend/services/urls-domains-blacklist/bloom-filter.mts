import { getUrlsDomainsBlacklistWorkLimit } from './work-limits.mts'
import { ValkeyBloomFilter, bloomValkeyClient } from '@data-stores/valkey'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { enqueueRebuildBloomFilter } from '@queues/bloom-filters/enqueues'
import { newBloomReadyMarkerValue } from './ready-marker.mts'
import {
  addDomainsToBlocklistBloomFilter,
  blocklistBloomAddTarget,
  type BlocklistBloomAddTarget,
  type BlocklistBloomFilterReadTarget,
  repairStaleBlocklistReadyMarker,
} from './blocklist-bloom-add.mts'
import { urlBlocklistBatchesFromDb } from './bloom-filter-batches.mts'
import {
  checkBloomFilterRead,
  checkBloomFiltersRead,
  repairBloomFilterUnavailableRead,
} from './read-repair.mts'
import onError from '@modules/on-error'
import { warmUpBlocklistBloomFilter } from './warmup-orchestration.mts'
import { withBlocklistBloomFilterLock } from './bloom-filter-lock.mts'

function getBloomFilter() {
  return new ValkeyBloomFilter({
    name: 'url-blocklist',
    capacity: 5_000_000,
    errorRate: 0.01,
    batchSize: getUrlsDomainsBlacklistWorkLimit('bloom_batch_size'),
    // ~5M domains rebuilt in the bloom-filters worker: cap in-flight chunks to limit Valkey pressure
    concurrencyLimit: 8,
    client: bloomValkeyClient,
  })
}

// Marker key set after each successful rebuild — used by warmup as a reliable
// readiness check instead of a bloom membership probe (which can false-positive).
const BLOOM_READY_KEY = 'bloom-filter:url-blocklist:ready'

export async function invalidateUrlBlocklistReadyMarker(): Promise<number> {
  return bloomValkeyClient.unlink([BLOOM_READY_KEY])
}

async function repairStaleReadyMarkerIfFilterUnavailable(): Promise<void> {
  await repairStaleBlocklistReadyMarker({
    filter: 'url-blocklist',
    readyKey: BLOOM_READY_KEY,
    liveKey: getBloomFilter().getConfig().liveKey,
  })
}

export async function enqueueUrlBlocklistRebuild(): Promise<void> {
  try {
    await enqueueRebuildBloomFilter({ filter: 'url-blocklist' })
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
}

export async function checkBloomFilter(
  hostname: string,
  target?: BlocklistBloomFilterReadTarget,
): Promise<boolean | null> {
  const bloomFilter = getBloomFilter()
  return checkBloomFilterRead({
    readyKey: target?.readyKey ?? BLOOM_READY_KEY,
    value: hostname,
    liveKey: target?.liveKey ?? bloomFilter.getConfig().liveKey,
    existsIfReady:
      target?.existsIfReady ?? ((readyKey, value) => bloomFilter.existsIfReady(readyKey, value)),
    repairUnavailableRead: target?.repairUnavailableRead ?? repairUrlBlocklistUnavailableRead,
  })
}

export async function checkBloomFilters(hostnames: string[]): Promise<Array<boolean | null>> {
  return checkBloomFiltersRead({
    readyKey: BLOOM_READY_KEY,
    liveKey: getBloomFilter().getConfig().liveKey,
    values: hostnames,
    mexistsIfReady: (readyKey, values) => getBloomFilter().mexistsIfReady(readyKey, values),
    repairUnavailableRead: repairUrlBlocklistUnavailableRead,
  })
}

/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review.
 * Evidence: `docs/overview/architecture/services/urls-domains-blacklist/README.md`.
 */
export async function addDomainsToBloomFilter(
  domains: string[],
  target?: BlocklistBloomAddTarget,
): Promise<void> {
  const bloomFilter = getBloomFilter()
  await addDomainsToBlocklistBloomFilter(
    domains,
    target ??
      blocklistBloomAddTarget({
        filter: 'url-blocklist',
        readyKey: BLOOM_READY_KEY,
        liveKey: bloomFilter.getConfig().liveKey,
        addOrThrow: validDomains => bloomFilter.addOrThrow(validDomains),
      }),
  )
}

export async function rebuildBloomFilter(): Promise<void> {
  await withBlocklistBloomFilterLock('url-blocklist', async () => {
    await getBloomFilter().rebuildFromStream(urlBlocklistBatchesFromDb())
    await bloomValkeyClient.set(BLOOM_READY_KEY, newBloomReadyMarkerValue())
  })
}

export async function warmUpUrlBlocklistBloomFilter(): Promise<void> {
  await warmUpBlocklistBloomFilter({
    hasData: hasUrlBlocklistData,
    isReady: () => getBloomFilter().isReady(BLOOM_READY_KEY),
    enqueueRebuild: enqueueUrlBlocklistRebuild,
  })
}

/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review. Evidence: `docs/overview/architecture/services/urls-domains-blacklist/README.md`.
 */
export async function deleteBloomFilter(): Promise<void> {
  await withBlocklistBloomFilterLock('url-blocklist', () =>
    getBloomFilter().deleteWithAdditionalKeys([BLOOM_READY_KEY]),
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
    SELECT 1 FROM blocklisted_domains db
    INNER JOIN domain_blocklist_sources dbs ON dbs.id = db.source_id
    WHERE dbs.type = 'url'::domain_blocklist_types
    LIMIT 1
  `)
  return rows.length > 0
}
