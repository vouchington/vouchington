import { cleanupTextEmbeddingCache } from './cleanup-text-embeddings.mts'
import { cleanupTerminalEmbeddingBatches } from './cleanup-embedding-batches.mts'
import { cleanupOldMediaDeliveryChanges } from './cleanup-media-delivery-changes.mts'
import { cleanupOldProviderResponseKeys } from './cleanup-provider-response-keys.mts'

const cleanups = {
  textEmbeddingCache: cleanupTextEmbeddingCache,
  terminalEmbeddingBatches: cleanupTerminalEmbeddingBatches,
  oldMediaDeliveryChanges: cleanupOldMediaDeliveryChanges,
  oldProviderResponseKeys: cleanupOldProviderResponseKeys,
}

type CleanupOptions = Parameters<typeof cleanupTextEmbeddingCache>[0] &
  Parameters<typeof cleanupTerminalEmbeddingBatches>[0] &
  Parameters<typeof cleanupOldMediaDeliveryChanges>[0] &
  Parameters<typeof cleanupOldProviderResponseKeys>[0]

/** One family's bounded pass; the queue owns admission, retry and continuation delivery. */
export async function cleanupAIRetentionFamily(
  family: keyof typeof cleanups,
  options: CleanupOptions,
): Promise<{ deleted: number; hasMore: boolean }> {
  return cleanups[family](options)
}
