import { deleteExpiredOAuthAuthorizationServerArtifactsBatch } from '@services/oauth-authorization-server'
import { DEFAULT_BATCH_SIZE, normalizePositiveInteger } from './cleanup-batches.mts'

type CleanupResult = { deleted: number; hasMore: boolean }

export async function cleanupExpiredOAuthAuthorizationServerArtifacts(
  options: { batchSize?: number; maxBatches?: number; lowerBoundDate?: Date; now?: Date } = {},
): Promise<CleanupResult> {
  const batchSize = normalizePositiveInteger(options.batchSize, DEFAULT_BATCH_SIZE, 'batchSize')
  const maxBatches = normalizePositiveInteger(options.maxBatches, Infinity, 'maxBatches')
  let deleted = 0
  let hasMore = false
  for (let batches = 0; batches < maxBatches; batches += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each bounded delete determines whether another artifact batch remains
    const result = await deleteExpiredOAuthAuthorizationServerArtifactsBatch(batchSize, options)
    deleted += result.deleted
    hasMore = result.hasMore
    if (!hasMore) break
  }
  return { deleted, hasMore }
}
