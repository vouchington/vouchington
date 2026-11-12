import {
  advanceBatchIngestionRevision,
  commitBatchIngestionTransaction,
  type BatchIngestionFence,
} from './ingestion-transaction.mts'
import { beginTransaction, read } from '@data-stores/psql'
import { findVertexBatch, retrieveVertexBatch } from '../provider.mts'
import { lifecycleColumnForVertexState } from '../derive-status.mts'
import { cleanupBatchLocks } from './cleanup.mts'

export const processBatch = async (batchId: string): Promise<void> => {
  const { rows: batchRows } = await read<{
    id: string
    job_name: string | null
    completed_at: Date | null
    failed_at: Date | null
    cancelled_at: Date | null
  }>(
    `/* processBatch */
    SELECT id, job_name, completed_at, failed_at, cancelled_at
    FROM gemini_embedding_batches
    WHERE id = $1
  `,
    [batchId],
  )

  if (batchRows.length === 0) {
    throw new Error(`Batch not found: ${batchId}`)
  }

  const persistedBatch = batchRows[0]
  if (persistedBatch.completed_at !== null) {
    return
  }
  if (persistedBatch.failed_at !== null || persistedBatch.cancelled_at !== null) {
    await cleanupBatchLocks(batchId)
    return
  }

  const batch =
    persistedBatch.job_name === null
      ? await findVertexBatch(batchId)
      : await retrieveVertexBatch(persistedBatch.job_name)
  await using query = await beginTransaction()
  // Reconcile a lost receipt before allowing another paid request. Missing jobs become
  // retryable after the two-hour receipt window, rather than retaining locks indefinitely.
  if (!batch) {
    const expired = await query(
      `/* processBatch unresolved submission */
      UPDATE gemini_embedding_batches
      SET failed_at = CURRENT_TIMESTAMP, data = data || '{"state":"JOB_STATE_FAILED"}'::jsonb
      WHERE id = $1 AND job_name IS NULL AND failed_at IS NULL AND cancelled_at IS NULL
        AND completed_at IS NULL AND submitted_at < CURRENT_TIMESTAMP - INTERVAL '2 hours'`,
      [batchId],
    )
    if (expired.rowCount) {
      await query(
        '/* processBatch unresolved unlock */ DELETE FROM gemini_embedding_batch_entities WHERE batch_id = $1',
        [batchId],
      )
    }
    await query.commit()
    return
  }
  const status = batch.state || 'JOB_STATE_PENDING'
  // Treat unrecognised statuses as failed to prevent indefinite polling
  const column = lifecycleColumnForVertexState(status) ?? 'failed_at'

  const transition = await query(
    `/* processBatch */
    UPDATE gemini_embedding_batches
    SET data = data || $2::jsonb,
        job_name = COALESCE(job_name, $3),
        ${column === 'completed_at' ? 'in_progress_at' : column} = COALESCE(${column === 'completed_at' ? 'in_progress_at' : column}, CURRENT_TIMESTAMP)
    WHERE id = $1
      AND completed_at IS NULL
      AND failed_at IS NULL
      AND cancelled_at IS NULL
  `,
    [batchId, JSON.stringify(batch), batch.name],
  )

  if ((transition.rowCount ?? 0) > 0 && (column === 'failed_at' || column === 'cancelled_at')) {
    await query(
      '/* processBatch terminal unlock */ DELETE FROM gemini_embedding_batch_entities WHERE batch_id = $1',
      [batchId],
    )
  }
  await query.commit()
}

export { retrieveVertexBatch } from '../provider.mts'

export async function completeBatchIngestion(
  batchId: string,
  fence?: BatchIngestionFence,
): Promise<void> {
  await using query = await beginTransaction()
  const nextGeneration = await advanceBatchIngestionRevision(query, fence)
  const completed = await query(
    `/* completeBatchIngestion */ UPDATE gemini_embedding_batches
    SET completed_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND completed_at IS NULL AND failed_at IS NULL AND cancelled_at IS NULL`,
    [batchId],
  )
  if (completed.rowCount) {
    await query(
      '/* completeBatchIngestion cleanup */ DELETE FROM gemini_embedding_batch_entities WHERE batch_id = $1',
      [batchId],
    )
  }
  await commitBatchIngestionTransaction(query, fence, nextGeneration)
}
