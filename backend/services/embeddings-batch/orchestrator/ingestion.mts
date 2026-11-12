import { beginTransaction } from '@data-stores/psql'

/** GlideMQ owns retry accounting; every result write is idempotent by canonical content hash. */
export async function ingestBatchResults(
  batchId: string,
  ingest: () => Promise<void>,
  finalAttempt: boolean,
): Promise<void> {
  try {
    await ingest()
  } catch (err) {
    if (finalAttempt) await failBatchIngestion(batchId)
    // Ingestion HTTP failures consume ordinary queue attempts, including permanent 4xx.
    // Keep their status below the top level so the outer provider-poll policy cannot defer them.
    throw new Error('Vertex batch result ingestion failed', { cause: err })
  }
}

export async function failBatchIngestion(batchId: string): Promise<void> {
  await failBatchIngestions([batchId])
}

export async function failBatchIngestions(
  batchIds: readonly string[],
  staleTtlHours?: number,
): Promise<void> {
  if (!batchIds.length) return
  await using query = await beginTransaction()
  const failed = await query<{ id: string }>(
    `/* failBatchIngestion */ UPDATE gemini_embedding_batches
    SET failed_at = CURRENT_TIMESTAMP
    WHERE id = ANY($1::uuid[]) AND completed_at IS NULL AND failed_at IS NULL AND cancelled_at IS NULL
      AND ($2::int IS NULL OR submitted_at < CURRENT_TIMESTAMP - $2::int * INTERVAL '1 hour')
    RETURNING id`,
    [batchIds, staleTtlHours ?? null],
  )
  if (failed.rowCount) {
    await query(
      '/* failBatchIngestion membership */ DELETE FROM gemini_embedding_batch_entities WHERE batch_id = ANY($1::uuid[])',
      [failed.rows.map(row => row.id)],
    )
  }
  await query.commit()
}
