import { providerTableConfigs } from '@services/oauth/providers'
import { DEFAULT_BATCH_SIZE, deleteOrphanedOAuthAccountBatch } from './cleanup-batches.mts'
import { getRetentionCutoffDate, normalizeRetentionDays } from './cleanup-options.mts'
import { assertPositiveInteger, normalizePositiveInteger } from './normalize-positive-integer.mts'
import type { CleanupOptions, CleanupResult } from './cleanup-run-shapes.mts'

// Data retention necessarily accesses tables owned by other services. This cross-service SQL is intentional:
// the retention job must hard-delete orphaned OAuth rows that have no owning service
// to delegate to (user_id is already NULL). Exposing hardDelete helpers from each
// OAuth provider would add significant boilerplate for a single use case.
export async function cleanupOrphanedOAuthAccounts(
  options: CleanupOptions,
): Promise<CleanupResult> {
  const retentionDays = normalizeRetentionDays(options.retentionDays, 90)
  const batchSize = normalizePositiveInteger(options.batchSize, DEFAULT_BATCH_SIZE, 'batchSize')
  const maxBatches = assertPositiveInteger(options.maxBatches, 'maxBatches')
  const now = options.now ?? new Date()
  const cutoffDate = getRetentionCutoffDate(retentionDays, now)
  const configs = Object.values(providerTableConfigs)
  // Daily rotation lets a capped run reach every provider even when an earlier one stays backlogged.
  const utcDay = Math.floor(now.getTime() / (24 * 60 * 60 * 1_000))
  const start = ((utcDay % configs.length) + configs.length) % configs.length
  const providerConfigs = [...configs.slice(start), ...configs.slice(0, start)]
  let batchesRun = 0
  let deleted = 0
  let hasMore = false

  for (const config of providerConfigs) {
    if (batchesRun >= maxBatches) {
      hasMore = true
      break
    }

    let providerHasMore = false
    while (batchesRun < maxBatches) {
      // oxlint-disable-next-line no-await-in-loop -- each provider batch commit determines its next page and keeps cross-table write pressure bounded
      const batchDeleted = await deleteOrphanedOAuthAccountBatch(
        config.table,
        config.providerUserIdColumn,
        cutoffDate,
        batchSize,
        options.lowerBoundDate,
      )
      batchesRun += 1
      deleted += batchDeleted
      providerHasMore = batchDeleted === batchSize
      if (!providerHasMore) break
    }

    hasMore ||= providerHasMore
    if (providerHasMore && batchesRun >= maxBatches) break
  }

  return { deleted, hasMore }
}
