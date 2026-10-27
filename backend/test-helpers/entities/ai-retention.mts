import { createHash, randomUUID } from 'node:crypto'
import type { TransactionQuery } from '@data-stores/psql'
import { v7 } from 'uuid'

const ZERO_VECTOR = `[${Array(1_024).fill(0).join(',')}]`

export async function insertTextEmbeddingForRetentionTest(
  query: TransactionQuery,
  updatedAt: Date,
): Promise<string> {
  const hash = createHash('sha256').update(randomUUID()).digest('hex')
  await query(
    `/* insertTextEmbeddingForRetentionTest */
    INSERT INTO bedrock_nova_multimodal_v1_embeddings
      (content_sha256, embedding, updated_at)
    VALUES (decode($1, 'hex'), $2::vector, $3)`,
    [hash, ZERO_VECTOR, updatedAt],
  )
  return hash
}

export async function textEmbeddingExistsForRetentionTest(
  query: TransactionQuery,
  hash: string,
): Promise<boolean> {
  const { rows } = await query(
    `/* textEmbeddingExistsForRetentionTest */
    SELECT 1 FROM bedrock_nova_multimodal_v1_embeddings
    WHERE content_sha256 = decode($1, 'hex')`,
    [hash],
  )
  return rows.length > 0
}

export async function insertProviderResponseKeyForRetentionTest(
  query: TransactionQuery,
  usageRecordId: string,
  at: Date,
): Promise<string> {
  const id = v7({ msecs: at.getTime() })
  await query(
    `/* insertProviderResponseKeyForRetentionTest */
    INSERT INTO ai_usage_provider_response_keys (id, response_id, ai_usage_record_id)
    VALUES ($1, $2, $3)`,
    [id, randomUUID(), usageRecordId],
  )
  return id
}

export async function providerResponseKeyExistsForRetentionTest(
  query: TransactionQuery,
  id: string,
): Promise<boolean> {
  const { rows } = await query(
    `/* providerResponseKeyExistsForRetentionTest */
    SELECT 1 FROM ai_usage_provider_response_keys WHERE id = $1`,
    [id],
  )
  return rows.length > 0
}

export async function insertEmbeddingBatchForRetentionTest(
  query: TransactionQuery,
  terminalAt: Date | null,
  jobType: 'topics' | 'posts' = 'topics',
): Promise<string> {
  const id = v7()
  await query(
    `/* insertEmbeddingBatchForRetentionTest */
    INSERT INTO bedrock_embedding_batches
      (id, model_id, job_type, submitted_at, completed_at)
    VALUES ($1, 'test-retention', $3::bedrock_embedding_batch_job_types, CURRENT_TIMESTAMP, $2)`,
    [id, terminalAt, jobType],
  )
  return id
}

export async function embeddingBatchExistsForRetentionTest(
  query: TransactionQuery,
  id: string,
): Promise<boolean> {
  const { rows } = await query(
    `/* embeddingBatchExistsForRetentionTest */
    SELECT 1 FROM bedrock_embedding_batches WHERE id = $1`,
    [id],
  )
  return rows.length > 0
}
