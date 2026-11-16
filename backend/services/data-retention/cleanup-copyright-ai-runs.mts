import {
  COPYRIGHT_AI_RUN_KINDS,
  deleteExpiredCopyrightAiRunBatch,
} from '@services/copyright-notices'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { getRetentionCutoffDate, normalizeRetentionDays } from './cleanup-options.mts'
import { runBoundedBatches } from './run-bounded-batches.mts'

export type CopyrightAiRunCleanupOptions = {
  batchSize?: number
  maxBatches: number
  retentionDays?: number
  now?: Date
  runIds?: readonly string[]
}

/**
 * Deletes per-attempt AI runs older than the retention window. A run still active after the
 * whole window is abandoned (its subject was rejected or erased before the job ran, so nothing
 * will finish it) and goes with the terminal ones. Runs are leaves: the immutable results they point to are not touched here, and a case
 * purge removes a case's runs before its results.
 */
export async function cleanupCopyrightAiRuns(
  options: CopyrightAiRunCleanupOptions,
): Promise<{ deleted: number; hasMore: boolean }> {
  const cutoffId = getMinUUIDv7ForDate(
    getRetentionCutoffDate(normalizeRetentionDays(options.retentionDays, 90), options.now),
  )
  const results = await Promise.all(
    COPYRIGHT_AI_RUN_KINDS.map(kind =>
      runBoundedBatches(options, batchSize =>
        deleteExpiredCopyrightAiRunBatch(kind, cutoffId, batchSize, options.runIds),
      ),
    ),
  )
  return {
    deleted: results.reduce((total, result) => total + result.deleted, 0),
    hasMore: results.some(result => result.hasMore),
  }
}
