import { getMinUUIDv7ForDate } from '@modules/utils'
import { deleteOldReferralAttributionBatch } from './cleanup-batches.mts'
import { getRetentionCutoffDate, normalizeRetentionDays } from './cleanup-options.mts'
import { runBoundedBatches } from './run-bounded-batches.mts'
import type { CleanupOptions, CleanupResult } from './cleanup-run-shapes.mts'

export async function cleanupOldReferralAttributions(
  options: CleanupOptions,
): Promise<CleanupResult> {
  const retentionDays = normalizeRetentionDays(options.retentionDays, 30)
  const cutoffDate = getRetentionCutoffDate(retentionDays, options.now)
  return runBoundedBatches(options, async batchSize =>
    deleteOldReferralAttributionBatch(
      getMinUUIDv7ForDate(cutoffDate),
      batchSize,
      options.lowerBoundDate === undefined
        ? undefined
        : getMinUUIDv7ForDate(options.lowerBoundDate),
    ),
  )
}
