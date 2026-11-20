import { read, write } from '@data-stores/psql'
import { rejectQuery } from './injected-failures.mts'

export const rejectVertexReceipt = () =>
  rejectQuery(
    write,
    (statement, values) => statement.includes('createBatch:markSubmitted') && values[1] !== null,
    'synthetic receipt failure',
  )

export async function insertBatchTopicMembership(batchId: string, topicId: string): Promise<void> {
  await write(
    `/* insertBatchTopicMembership */ INSERT INTO gemini_embedding_batch_entities
    (batch_id, entity_type, topic_id) VALUES ($1, 'topics', $2)`,
    [batchId, topicId],
  )
}

export async function getBatchCanonicalDocument(batchId: string) {
  const { rows } = await read<{
    job_name: string | null
    model_id: string
    data: Record<string, unknown>
  }>(
    '/* getBatchCanonicalDocument */ SELECT job_name, model_id, data FROM gemini_embedding_batches WHERE id = $1',
    [batchId],
  )
  return rows[0]!
}
