import { beginTransaction, write, read } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { rejectQuery } from './injected-failures.mts'

export const rejectVertexReceipt = () =>
  rejectQuery(
    write,
    (statement, values) => statement.includes('createBatch:markSubmitted') && values[1] !== null,
    'synthetic receipt failure',
  )

export async function insertBatchTopicLock(batchId: string, topicId: string): Promise<void> {
  await write(
    `/* insertBatchTopicLock */ INSERT INTO gemini_embedding_batch_entities
    (batch_id, entity_type, topic_id) VALUES ($1, 'topics', $2)`,
    [batchId, topicId],
  )
}

export async function getBatchIngestionFailures(batchId: string): Promise<number> {
  const { rows } = await read<{ ingestion_failures: number }>(
    '/* getBatchIngestionFailures */ SELECT ingestion_failures FROM gemini_embedding_batches WHERE id = $1',
    [batchId],
  )
  return rows[0]!.ingestion_failures
}

/** A caller can fail a real transaction after its revision write and observe its rollback. */
export async function withRollbackIngestionQuery(
  run: (query: TransactionQuery) => Promise<void>,
): Promise<void> {
  await using query = await beginTransaction()
  await run(query)
}
