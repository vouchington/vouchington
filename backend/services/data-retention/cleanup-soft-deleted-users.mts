import type { UserPurgeResult } from './user-purge-types.mts'
import { DEFAULT_BATCH_SIZE, cleanupSoftDeletedUserBatch } from './cleanup-batches.mts'
import { getRetentionCutoffDate, normalizeRetentionDays } from './cleanup-options.mts'
import { assertPositiveInteger, normalizePositiveInteger } from './normalize-positive-integer.mts'
import type { CleanupOptions } from './cleanup-run-shapes.mts'

export async function cleanupSoftDeletedUsers(
  options: CleanupOptions & { userIds?: readonly string[] },
): Promise<UserPurgeResult> {
  const retentionDays = normalizeRetentionDays(options.retentionDays, 90)
  const cutoffDate = getRetentionCutoffDate(retentionDays, options.now)
  const batchSize = normalizePositiveInteger(options.batchSize, DEFAULT_BATCH_SIZE, 'batchSize')
  const maxBatches = assertPositiveInteger(options.maxBatches, 'maxBatches')
  let deleted = 0
  let hasMore = false
  for (let batch = 0; batch < maxBatches; batch++) {
    // oxlint-disable-next-line no-await-in-loop -- a committed publication page may progress without purging its user.
    const result = await cleanupSoftDeletedUserBatch(
      cutoffDate,
      batchSize,
      options.lowerBoundDate,
      options.userPurge,
      options.userIds,
    )
    deleted += result.deleted
    hasMore = result.hasMore
    if (result.userPurge) return { deleted, hasMore, userPurge: result.userPurge }
    if (options.userPurge) return { deleted, hasMore }
    if (!hasMore) break
  }
  return { deleted, hasMore }
}
