import { createHash, randomUUID } from 'node:crypto'
import { write, type TransactionQuery } from '@data-stores/psql'
import { v7 } from 'uuid'

const ZERO_VECTOR = `[${Array(1_024).fill(0).join(',')}]`

export async function resetAiRetentionCursorForTest(
  query: TransactionQuery,
  family: 'text' | 'batch' | 'moderation' | 'receipt',
): Promise<void> {
  const table = {
    text: 'bedrock_text_embedding_retention_cursors',
    batch: 'bedrock_embedding_batch_retention_cursors',
    moderation: 'post_moderation_work_retention_cursors',
    receipt: 'ai_agent_receipt_retention_cursors',
  }[family]
  const cursorColumns = {
    text: 'cursor_updated_at = NULL, cursor_content_sha256 = NULL, sweep_upper_bound_updated_at = NULL, bloom_rebuild_generation = 0, is_bloom_rebuild_needed = FALSE',
    batch:
      'cursor_terminal_at = NULL, cursor_batch_id = NULL, sweep_upper_bound_terminal_at = NULL',
    moderation:
      'cursor_completed_at = NULL, cursor_version_id = NULL, cursor_source = NULL, sweep_upper_bound_completed_at = NULL',
    receipt: 'cursor_receipt_id = NULL, sweep_upper_bound_receipt_id = NULL',
  }[family]
  await query(`/* ensureAiRetentionCursorForTest */ INSERT INTO ${table} (is_singleton)
    VALUES (TRUE) ON CONFLICT DO NOTHING`)
  await query(`/* lockAiRetentionCursorForTest */ SELECT is_singleton FROM ${table}
    WHERE is_singleton FOR UPDATE`)
  await query(`/* resetAiRetentionCursorForTest */ UPDATE ${table} SET ${cursorColumns}
    WHERE is_singleton`)
}

export async function insertReportReceiptForRetentionTest(
  query: TransactionQuery,
  postId: string,
  input: { reservedAt: Date; completedAt: Date; consumedAt?: Date | null },
): Promise<string> {
  const id = v7({ msecs: input.reservedAt.getTime() })
  const operationKey = createHash('sha256').update(randomUUID()).digest('hex')
  const requestHash = createHash('sha256').update(randomUUID()).digest('hex')
  await query(
    `/* insertReportReceiptKeyForRetentionTest */
    INSERT INTO ai_agent_call_receipt_keys (id, operation_key, request_sha256)
    VALUES ($1, $2, $3)`,
    [id, operationKey, requestHash],
  )
  await query(
    `/* insertReportReceiptForRetentionTest */
    INSERT INTO ai_agent_call_receipts
      (id, agent_slug, post_id, status, result_ciphertext, completed_at, consumed_at)
    VALUES ($1, 'report-judgement', $2, 'done', $3, $4, $5)`,
    [
      id,
      postId,
      'encrypted-test-result',
      input.completedAt,
      input.consumedAt === undefined ? null : input.consumedAt,
    ],
  )
  return id
}

export async function reportReceiptCiphertextForRetentionTest(
  query: TransactionQuery,
  id: string,
): Promise<string | null | undefined> {
  const { rows } = await query<{ result_ciphertext: string | null }>(
    `/* reportReceiptCiphertextForRetentionTest */
     SELECT result_ciphertext FROM ai_agent_call_receipts WHERE id = $1`,
    [id],
  )
  return rows[0]?.result_ciphertext
}

export async function eraseOwnedReportReceiptForReplayTest(operationKey: string): Promise<void> {
  const { rowCount } = await write(
    `/* eraseOwnedReportReceiptForReplayTest */
    UPDATE ai_agent_call_receipts SET result_ciphertext = NULL, status = 'erased'
    WHERE id = (SELECT id FROM ai_agent_call_receipt_keys WHERE operation_key = $1)
      AND consumed_at IS NOT NULL AND agent_slug = 'report-judgement'`,
    [operationKey],
  )
  if (rowCount !== 1) throw new Error('Expected an owned, consumed report receipt')
}

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

export async function textEmbeddingBloomRebuildStateForTest(
  query: TransactionQuery,
): Promise<{ generation: number; needed: boolean }> {
  const { rows } = await query<{ generation: number; needed: boolean }>(
    `/* textEmbeddingBloomRebuildStateForTest */
     SELECT bloom_rebuild_generation::int AS generation,
       is_bloom_rebuild_needed AS needed
     FROM bedrock_text_embedding_retention_cursors WHERE is_singleton`,
  )
  return rows[0]
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

export async function resetProviderResponseKeyRetentionCursorForTest(
  query: TransactionQuery,
): Promise<void> {
  await query(`/* ensureProviderResponseKeyRetentionCursorForTest */
    INSERT INTO ai_usage_response_key_retention_cursors (is_singleton)
    VALUES (TRUE) ON CONFLICT DO NOTHING`)
  await query(`/* resetProviderResponseKeyRetentionCursorForTest */
    UPDATE ai_usage_response_key_retention_cursors
    SET cursor_id = NULL, sweep_upper_bound_id = NULL WHERE is_singleton`)
}

export async function insertEmbeddingBatchForRetentionTest(
  query: TransactionQuery,
  terminalAt: Date | null,
): Promise<string> {
  const id = v7()
  await query(
    `/* insertEmbeddingBatchForRetentionTest */
    INSERT INTO bedrock_embedding_batches
      (id, model_id, job_type, submitted_at, completed_at)
    VALUES ($1, 'test-retention', 'topics', CURRENT_TIMESTAMP, $2)`,
    [id, terminalAt],
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
