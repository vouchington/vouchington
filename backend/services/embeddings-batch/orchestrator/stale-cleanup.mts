import type { BatchListingCursor } from '@services/embeddings/batch/orchestrator/listing-page'
import { processBatch, retrieveVertexBatch } from './poll.mts'
import { stopVertexBatch } from './cleanup.mts'
import { getStaleBatches } from './find-stale.mts'
import { lifecycleColumnForVertexState } from '../derive-status.mts'
import onError from '@modules/on-error'
import { cleanupAbandonedPreparingBatches } from './preparing-cleanup.mts'

export type StaleCleanupResult = {
  hasMore: boolean
  nextCursor?: BatchListingCursor
  inspected: number
  reconciled: number
  forcedCancellations: Array<{ id: string; jobName: string }>
}

export async function runStaleCleanup(
  ttlHours: number,
  cursor?: BatchListingCursor,
): Promise<StaleCleanupResult> {
  await cleanupAbandonedPreparingBatches(ttlHours)
  const page = await getStaleBatches(ttlHours, cursor)
  const staleBatches = page.batches
  const forcedCancellations: Array<{ id: string; jobName: string }> = []
  let reconciled = 0

  for (const batch of staleBatches) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- inspect one stale batch at a time to avoid amplifying Vertex quota failures
      const vertexBatch = await retrieveVertexBatch(batch.job_name)
      const status = vertexBatch.state || 'JOB_STATE_PENDING'
      const column = lifecycleColumnForVertexState(status)

      if (column === 'completed_at') {
        // Vertex completed — do not set completed_at here; poll_dispatcher runs the full
        // result-download pipeline via processBatchPolling on the next cycle. Setting
        // completed_at now would drop the batch from getPendingBatches before results ingest.
        reconciled++
      } else if (column === 'failed_at' || column === 'cancelled_at') {
        // Already terminal in Vertex — reconcile lifecycle timestamp and release locks.
        // oxlint-disable-next-line no-await-in-loop -- terminal reconciliation must finish before inspecting the next stale batch
        await processBatch(batch.id)
        reconciled++
      } else if (column === null) {
        // Unknown Vertex status — do not force-cancel; treat conservatively.
        // poll_dispatcher reconciles unknown statuses as failed_at on next cycle.
        reconciled++
      } else {
        // Still running past TTL (submitted_at or in_progress_at column) — force stop.
        try {
          // oxlint-disable-next-line no-await-in-loop -- stop requests remain serial to avoid amplifying Vertex quota failures
          await stopVertexBatch(batch.job_name)
        } catch (err) {
          onError(err instanceof Error ? err : new Error(String(err)))
          // Stop failed — skip; poll_dispatcher or the next stale-cleanup cycle will reconcile.
          // Do not fall back to processBatch: if Vertex just moved to Completed, processBatch
          // would set completed_at prematurely and drop the batch from getPendingBatches before
          // results are downloaded.
          continue
        }
        // Vertex cancellation is asynchronous. Keep the batch pollable and its locks held
        // until a subsequent poll observes a terminal provider state.
        forcedCancellations.push({ id: batch.id, jobName: batch.job_name })
      }
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)))
    }
  }

  return {
    hasMore: page.hasMore,
    ...(page.nextCursor && { nextCursor: page.nextCursor }),
    inspected: staleBatches.length,
    reconciled,
    forcedCancellations,
  }
}
