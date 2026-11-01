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
  void runHygieneSweeps()
  await Promise.all([
    warmUpEmbeddingBloomFilter(),
    warmUpUrlBlocklistBloomFilter(),
    warmUpEmailBlocklistBloomFilter(),
    warmUpEntityCacheBloomFilters(),
  ])
}

async function runHygieneSweeps(): Promise<void> {
  for (const sweep of [
    expireOrphanedBloomFilterBuildingKeys,
    sweepBookmarkBloomFiltersMissingTtl,
  ]) {
    // oxlint-disable-next-line no-await-in-loop -- sweeps share bloomValkeyClient; one at a time bounds peak concurrent SCAN/Batch traffic instead of doubling it
    await sweep().catch((err: unknown) => {
      onError(err instanceof Error ? err : new Error(String(err)))
    })
  }
}
