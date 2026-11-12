import { beginTransaction, write } from '@data-stores/psql'
import {
  BatchIngestionSupersededError,
  type BatchIngestionFence,
} from './ingestion-transaction.mts'

/** Normal queue deliveries serialize; a recovered delivery fences an abandoned attempt. */
export async function ingestBatchResults(
  batchId: string,
  ingest: (fence: BatchIngestionFence) => Promise<void>,
): Promise<boolean> {
  const claimed = await write<{ ingestion_generation: number }>(
    `/* ingestBatchResults */ UPDATE gemini_embedding_batches
    SET ingestion_generation = ingestion_generation + 1
    WHERE id = $1 AND completed_at IS NULL AND failed_at IS NULL AND cancelled_at IS NULL
      AND data->>'state' IN ('JOB_STATE_SUCCEEDED', 'JOB_STATE_PARTIALLY_SUCCEEDED')
    RETURNING ingestion_generation`,
    [batchId],
  )
  const generation = claimed.rows[0]?.ingestion_generation
  if (generation === undefined) return false
  const fence = { batchId, generation }
  try {
    await ingest(fence)
    return true
  } catch (err) {
    if (err instanceof BatchIngestionSupersededError) return false
    await recordIngestionFailure(fence)
    throw err
  }
}

async function recordIngestionFailure(fence: BatchIngestionFence): Promise<void> {
  await using query = await beginTransaction()
  const failed = await query<{ failed_at: Date | null }>(
    `/* recordIngestionFailure */ UPDATE gemini_embedding_batches
    SET ingestion_failures = LEAST(ingestion_failures + 1, 3),
        failed_at = CASE WHEN ingestion_failures >= 2 THEN CURRENT_TIMESTAMP ELSE NULL END
    WHERE id = $1 AND ingestion_generation = $2
      AND completed_at IS NULL AND failed_at IS NULL AND cancelled_at IS NULL
      AND data->>'state' IN ('JOB_STATE_SUCCEEDED', 'JOB_STATE_PARTIALLY_SUCCEEDED')
    RETURNING failed_at`,
    [fence.batchId, fence.generation],
  )
  if (failed.rows[0]?.failed_at) {
    await query(
      '/* recordIngestionFailure unlock */ DELETE FROM gemini_embedding_batch_entities WHERE batch_id = $1',
      [fence.batchId],
    )
  }
  await query.commit()
}
