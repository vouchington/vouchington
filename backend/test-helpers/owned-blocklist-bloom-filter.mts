import { randomUUID } from 'node:crypto'
import { bloomValkeyClient, ValkeyBloomFilter } from '@data-stores/valkey'
import {
  blocklistBloomAddTarget,
  repairStaleBlocklistReadyMarker,
  type BlocklistBloomAddTarget,
  type BlocklistBloomFilterReadTarget,
} from '../services/urls-domains-blacklist/blocklist-bloom-add.mts'
import { repairBloomFilterUnavailableRead } from '../services/urls-domains-blacklist/read-repair.mts'

type BlocklistFilterName = 'url-blocklist' | 'email-blocklist'

function ownedBlocklistReadTarget(input: {
  filter: BlocklistFilterName
  readyKey: string
  bloomFilter: ValkeyBloomFilter
}): BlocklistBloomFilterReadTarget {
  return {
    readyKey: input.readyKey,
    liveKey: input.bloomFilter.getKey(),
    existsIfReady: (readyKey, value) => input.bloomFilter.existsIfReady(readyKey, value),
    repairUnavailableRead: () =>
      repairBloomFilterUnavailableRead({
        filter: input.filter,
        readyKey: input.readyKey,
        repairStaleReadyMarker: () =>
          repairStaleBlocklistReadyMarker({
            filter: input.filter,
            readyKey: input.readyKey,
            liveKey: input.bloomFilter.getKey(),
          }),
      }),
  }
}

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
      readTarget: ownedBlocklistReadTarget({ filter, readyKey, bloomFilter }),
    })
  } finally {
    await bloomValkeyClient.unlink([liveKey, bloomFilter.getBuildingKey(), readyKey])
  }
}
