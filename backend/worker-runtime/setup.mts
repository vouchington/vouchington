import { warmUpEmbeddingBloomFilter } from '@services/bedrock-embeddings'
import {
  warmUpUrlBlocklistBloomFilter,
  warmUpEmailBlocklistBloomFilter,
} from '@services/urls-domains-blacklist'
import { warmUpEntityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { warmUpApiKeyBloomFilter } from '@services/api-keys'
import {
  expireOrphanedBloomFilterBuildingKeys,
  sweepBookmarkBloomFiltersMissingTtl,
} from '@services/bloom-filter-maintenance'
import onError from '@modules/on-error'

export async function setup(): Promise<void> {
  if (!process.env.API_KEY_CHECKSUM_SECRET) {
    throw new Error('API_KEY_CHECKSUM_SECRET is not set — worker cannot start without it')
  }
  warmUpApiKeyBloomFilter().catch((err: unknown) => {
    onError(err instanceof Error ? err : new Error(String(err)))
  })
  // Not a readiness dependency — fire-and-forget like the api-key warmup above, so a slow/failed
  // sweep never gates worker startup or job processing.
  /* c8 ignore next -- fire-and-forget dispatch; runHygieneSweeps is covered directly below. */
  void runHygieneSweeps()
  await Promise.all([
    warmUpEmbeddingBloomFilter(),
    warmUpUrlBlocklistBloomFilter(),
    warmUpEmailBlocklistBloomFilter(),
    warmUpEntityCacheBloomFilters(),
  ])
}

// `sweeps` is injectable so tests can exercise the catch-and-report path with a deliberately
// rejecting sweep, without mocking `@services/bloom-filter-maintenance` or touching Valkey
// directly (backend/worker-runtime is not on the dependency-cruiser allowlist for `@data-stores/*`).
export async function runHygieneSweeps(
  sweeps: readonly (() => Promise<void>)[] = [
    expireOrphanedBloomFilterBuildingKeys,
    sweepBookmarkBloomFiltersMissingTtl,
  ],
): Promise<void> {
  for (const sweep of sweeps) {
    // oxlint-disable-next-line no-await-in-loop -- sweeps share bloomValkeyClient; one at a time bounds peak concurrent SCAN/Batch traffic instead of doubling it
    await sweep().catch((err: unknown) => {
      onError(err instanceof Error ? err : new Error(String(err)))
    })
  }
}
