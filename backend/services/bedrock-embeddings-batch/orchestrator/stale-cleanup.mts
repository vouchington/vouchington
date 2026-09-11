import { processBatch, retrieveBedrockBatch } from './poll.mts'
import { cleanupBatchLocks, stopBedrockBatch } from './cleanup.mts'
import { getStaleBatches } from './find-stale.mts'
import { lifecycleColumnForBedrockStatus } from '../derive-status.mts'
import { write } from '@data-stores/psql'
import onError from '@modules/on-error'

export type StaleCleanupResult = {
  inspected: number
  reconciled: number
  forcedCancellations: Array<{ id: string; jobArn: string }>
}

export async function runStaleCleanup(ttlHours: number): Promise<StaleCleanupResult> {
  const staleBatches = await getStaleBatches(ttlHours)
  const forcedCancellations: Array<{ id: string; jobArn: string }> = []
  let reconciled = 0

  for (const batch of staleBatches) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- inspect one stale batch at a time to avoid amplifying Bedrock quota failures
      const bedrockBatch = await retrieveBedrockBatch(batch.job_arn)
      const status = bedrockBatch.status || 'Submitted'
      const column = lifecycleColumnForBedrockStatus(status)

      if (column === 'completed_at') {
        // Bedrock completed — do not set completed_at here; poll_dispatcher runs the full
        // result-download pipeline via processBatchPolling on the next cycle. Setting
        // completed_at now would drop the batch from getPendingBatches before results ingest.
        reconciled++
      } else if (column === 'failed_at' || column === 'cancelled_at') {
        // Already terminal in Bedrock — reconcile lifecycle timestamp and release locks.
        // oxlint-disable-next-line no-await-in-loop -- terminal reconciliation must finish before inspecting the next stale batch
        await processBatch(batch.id)
        reconciled++
      } else if (column === null) {
        // Unknown Bedrock status — do not force-cancel; treat conservatively.
        // poll_dispatcher reconciles unknown statuses as failed_at on next cycle.
        reconciled++
      } else {
        // Still running past TTL (submitted_at or in_progress_at column) — force stop.
        try {
          // oxlint-disable-next-line no-await-in-loop -- stop requests remain serial to avoid amplifying Bedrock quota failures
          await stopBedrockBatch(batch.job_arn)
        } catch (stopError) {
          onError(stopError instanceof Error ? stopError : new Error(String(stopError)))
          // Stop failed — skip; poll_dispatcher or the next stale-cleanup cycle will reconcile.
          // Do not fall back to processBatch: if Bedrock just moved to Completed, processBatch
          // would set completed_at prematurely and drop the batch from getPendingBatches before
          // results are downloaded.
          continue
        }
        // Release locks before marking terminal so a lock-cleanup failure leaves the batch
        // retryable on the next stale-cleanup cycle rather than permanently stuck.
        // oxlint-disable-next-line no-await-in-loop -- this batch's locks must be released before its cancellation is recorded
        await cleanupBatchLocks(batch.id)
        // oxlint-disable-next-line no-await-in-loop -- cancellation is recorded only after this batch's lock cleanup completes
        await write(
          `/* runStaleCleanup */
          UPDATE bedrock_embeddings_batches
          SET cancelled_at = NOW()
          WHERE id = $1 AND cancelled_at IS NULL`,
          [batch.id],
        )
        forcedCancellations.push({ id: batch.id, jobArn: batch.job_arn })
      }
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)))
    }
  }

  return {
    inspected: staleBatches.length,
    reconciled,
    forcedCancellations,
  }
}
