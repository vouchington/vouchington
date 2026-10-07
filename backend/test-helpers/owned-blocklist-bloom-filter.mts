import { randomUUID } from 'node:crypto'
import { bloomValkeyClient, ValkeyBloomFilter } from '@data-stores/valkey'
import {
  blocklistBloomAddTarget,
  blocklistBloomReadTarget,
  type BlocklistBloomAddTarget,
  type BlocklistBloomFilterReadTarget,
} from '../services/urls-domains-blacklist/blocklist-bloom-add.mts'

type BlocklistFilterName = 'url-blocklist' | 'email-blocklist'

export type OwnedBlocklistBloom = {
  bloomFilter: ValkeyBloomFilter
  readyKey: string
  addTarget: BlocklistBloomAddTarget
  readTarget: BlocklistBloomFilterReadTarget
}

// The live bloom-filter worker and other forks mutate the shared url-blocklist and
// email-blocklist keys. Recovery assertions use a private filter so that observation
// stays stable. A unique name is not rebuilt by the in-process worker.
export async function withOwnedBlocklistBloomFilter(
  filter: BlocklistFilterName,
  run: (owned: OwnedBlocklistBloom) => Promise<void>,
): Promise<void> {
  const bloomFilter = new ValkeyBloomFilter({
    name: `${filter}-${randomUUID()}`,
    capacity: 1_000,
    errorRate: 0.01,
    batchSize: 100,
    client: bloomValkeyClient,
  })
  const readyKey = `${bloomFilter.getKey()}:ready`
  const liveKey = bloomFilter.getKey()
  try {
    await run({
      bloomFilter,
      readyKey,
      addTarget: blocklistBloomAddTarget({
        filter,
        readyKey,
        liveKey,
        addOrThrow: domains => bloomFilter.addOrThrow(domains),
      }),
      readTarget: blocklistBloomReadTarget({ filter, readyKey, bloomFilter }),
    })
  } finally {
    await bloomValkeyClient.unlink([liveKey, bloomFilter.getBuildingKey(), readyKey])
  }
}
