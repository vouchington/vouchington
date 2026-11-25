import { createHash, randomUUID } from 'node:crypto'
import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { v7 } from 'uuid'
import { withTestOwnedPostgresWait } from '../postgres-client-lock-observer.mts'
import { getTestPostgresBackendProcessId } from '../postgres-lock-wait.mts'

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

export async function refreshTextEmbeddingDuringRetentionForTest<T>(
  hash: string,
  operation: () => Promise<T>,
): Promise<T> {
  await using refresh = await beginTransaction()
  await refresh(
    `/* refreshTextEmbeddingDuringRetentionForTest */
    UPDATE bedrock_nova_multimodal_v1_embeddings
    SET input_token_count = 1
    WHERE content_sha256 = decode($1, 'hex') AND input_token_count IS NULL`,
    [hash],
  )
  return await withTestOwnedPostgresWait(
    {
      holderProcessId: await getTestPostgresBackendProcessId(refresh),
      pool: 'write',
      lock: { kind: 'transaction' },
      queryMarker: 'deleteTextEmbeddingRetentionPage',
      releaseHolder: () => refresh[Symbol.asyncDispose](),
    },
    async waitForLock => {
      const pending = operation()
      await waitForLock(pending)
      await refresh.commit()
      return pending
    },
  )
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
