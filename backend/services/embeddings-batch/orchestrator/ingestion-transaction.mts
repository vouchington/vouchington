import { beginTransaction } from '@data-stores/psql'

export type BatchIngestionFence = { batchId: string; generation: number }
export class BatchIngestionSupersededError extends Error {
  constructor() {
    super('Embedding batch ingestion was superseded or already terminated')
  }
}

/** A claim cannot change while this chunk commits its entity/cache writes. */
export async function beginBatchIngestionTransaction(fence?: BatchIngestionFence) {
  const query = await beginTransaction()
  if (fence) {
    try {
      const active = await query(
        `/* beginBatchIngestionTransaction */ SELECT id FROM gemini_embedding_batches
        WHERE id = $1 AND ingestion_generation = $2 AND completed_at IS NULL
          AND failed_at IS NULL AND cancelled_at IS NULL FOR UPDATE`,
        [fence.batchId, fence.generation],
      )
      if (!active.rowCount) throw new BatchIngestionSupersededError()
    } catch (err) {
      await query[Symbol.asyncDispose]()
      throw err
    }
  }
  return query
}
