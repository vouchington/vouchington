import { ValkeyBloomFilter, bloomValkeyClient } from '@data-stores/valkey'
import { enqueueRebuildBloomFilter } from '@queues/bloom-filters/enqueues'
import onError from '@modules/on-error'

export const EMBEDDING_BLOOM_READY_KEY =
  'bloom-filter:bedrock-nova-2-multimodal-embeddings-v1:ready'

/**
 * Bloom filter instance for tracking existing embeddings
 * Used to avoid DB lookups for content that definitely hasn't been embedded yet
 *
 * Parameters:
 * - 100K starting capacity with auto-expansion (expansion rate of 2, cascades when full)
 * - 0.01% false positive rate
 *
 * Why ValkeyBloomFilter?
 * - Uses RedisBloom's BF.* commands (battle-tested, optimized)
 * - BF.MEXISTS checks multiple items in a single roundtrip
 * - EXPANSION allows cascading sub-filters (200K, 400K, etc.) when capacity exceeded
 */
export const embeddingBloomFilter = new ValkeyBloomFilter({
  name: 'bedrock-nova-2-multimodal-embeddings-v1',
  capacity: 100_000,
  errorRate: 0.0001, // 0.01%
  expansionRate: 2,
  client: bloomValkeyClient,
})

async function invalidateReadyMarkerAndEnqueueRebuild(): Promise<void> {
  try {
    const removed = await bloomValkeyClient.unlink([EMBEDDING_BLOOM_READY_KEY])
    if (Number(removed) > 0) {
      await enqueueRebuildBloomFilter({ filter: 'embedding' })
    }
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
  }
}

export async function addEmbeddingHashesToBloomFilter(hexHashes: string[]): Promise<void> {
  try {
    await embeddingBloomFilter.addOrThrow(hexHashes)
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
    await invalidateReadyMarkerAndEnqueueRebuild()
  }
}
