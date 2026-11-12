import type { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'

export type BatchIngestionFence = { batchId: string; generation: number }
export class BatchIngestionSupersededError extends Error {
  constructor() {
    super('Embedding batch ingestion was superseded or already terminated')
  }
}

/** Advance the written batch revision in the same transaction as this chunk's vectors. */
export async function advanceBatchIngestionRevision(
  query: TransactionQuery,
  fence?: BatchIngestionFence,
): Promise<number | undefined> {
  if (!fence) return undefined
  const active = await query<{ ingestion_generation: number }>(
    `/* advanceBatchIngestionRevision */ UPDATE gemini_embedding_batches
    SET ingestion_generation = ingestion_generation + 1
    WHERE id = $1 AND ingestion_generation = $2 AND completed_at IS NULL
      AND failed_at IS NULL AND cancelled_at IS NULL RETURNING ingestion_generation`,
    [fence.batchId, fence.generation],
  )
  if (!active.rowCount) throw new BatchIngestionSupersededError()
  return active.rows[0]!.ingestion_generation
}

export async function commitBatchIngestionTransaction(
  query: Awaited<ReturnType<typeof beginTransaction>>,
  fence: BatchIngestionFence | undefined,
  nextGeneration: number | undefined,
): Promise<void> {
  await query.commit()
  // A rollback or ambiguous commit must never advance the in-memory owner's token.
  if (fence && nextGeneration !== undefined) fence.generation = nextGeneration
}
