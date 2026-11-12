import { write, read } from '@data-stores/psql'
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
