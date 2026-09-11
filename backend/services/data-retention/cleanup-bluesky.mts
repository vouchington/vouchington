import {
  deleteAbandonedBlueskyLinkSessionBatch,
  deleteExpiredBlueskyHandoffBatch,
} from './abandoned-bluesky-sessions.mts'
import { DEFAULT_BATCH_SIZE, normalizePositiveInteger } from './cleanup-batches.mts'

type CleanupOptions = {
  batchSize?: number
  maxBatches?: number
  lowerBoundDate?: Date
  now?: Date
}

type CleanupResult = {
  deleted: number
  hasMore: boolean
}

export async function cleanupExpiredBlueskyLinkCompletions(
  options: CleanupOptions = {},
): Promise<CleanupResult> {
  return await runBatchedBlueskyCleanup(
    options,
    async batchSize =>
      await deleteExpiredBlueskyHandoffBatch(batchSize, {
        lowerBoundDate: options.lowerBoundDate,
        now: options.now,
      }),
  )
}

export async function cleanupAbandonedBlueskyLinkSessions(
  options: CleanupOptions = {},
): Promise<CleanupResult> {
  const cutoffDate = options.now ?? new Date()
  return await runBatchedBlueskyCleanup(
    options,
    async batchSize =>
      await deleteAbandonedBlueskyLinkSessionBatch(cutoffDate, batchSize, options.lowerBoundDate),
  )
}

async function runBatchedBlueskyCleanup(
  options: Pick<CleanupOptions, 'batchSize' | 'maxBatches'>,
  deleteBatch: (batchSize: number) => Promise<number>,
): Promise<CleanupResult> {
  const batchSize = normalizePositiveInteger(options.batchSize, DEFAULT_BATCH_SIZE, 'batchSize')
  const maxBatches = normalizePositiveInteger(options.maxBatches, Infinity, 'maxBatches')
  let deleted = 0
  let hasMore = false
  for (let batches = 0; batches < maxBatches; batches += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each bounded deletion determines whether another batch remains
    const batchDeleted = await deleteBatch(batchSize)
    deleted += batchDeleted
    hasMore = batchDeleted === batchSize
    if (!hasMore) break
  }
  return { deleted, hasMore }
}
