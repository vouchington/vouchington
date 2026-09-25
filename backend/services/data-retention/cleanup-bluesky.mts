import {
  deleteAbandonedBlueskyLinkSessionBatch,
  deleteExpiredBlueskyHandoffBatch,
} from './abandoned-bluesky-sessions.mts'
import { runBoundedBatches } from './run-bounded-batches.mts'

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
  return await runBoundedBatches(
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
  return await runBoundedBatches(
    options,
    async batchSize =>
      await deleteAbandonedBlueskyLinkSessionBatch(cutoffDate, batchSize, options.lowerBoundDate),
  )
}
