import { cleanupTextEmbeddingCache } from '@services/data-retention/cleanup-text-embeddings'

/** An empty owned database must not schedule an embedding Bloom rebuild. */
export async function assertIdleEmbeddingRetention() {
  const result = await cleanupTextEmbeddingCache({ now: new Date(), maxBatches: 1 })
  if (result.deleted !== 0 || result.hasMore || result.continuation !== null) {
    throw new Error('Fresh pruning database unexpectedly contained aged text embeddings')
  }
  return result
}
