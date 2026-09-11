import { read, write } from '@data-stores/psql'
import { sha256 } from '@modules/utils'
import type { SupportMessage } from '@voucha/types/entities/support-message'
import pgvector from 'pgvector/pg'
import { insertCentralizedEmbeddingsBulk } from '../centralized-table.mts'
import { EMBEDDING_COLUMNS, EMBEDDINGS_TABLE } from '../config.mts'
import { lookupExistingEmbedding } from '../lookup.mts'
import { createBedrockEmbedding } from './request.mts'
import { requireDenseEmbedding } from './require-dense-embedding.mts'

export async function upsertSupportMessageEmbedding(message: SupportMessage): Promise<void> {
  const content = message.body_text.trim()
  if (!content) return

  const content_sha256 = sha256(content)
  const { rows } = await read(
    `/* upsertSupportMessageEmbedding:check */
    SELECT 1
    FROM support_messages
    WHERE support_thread_id = $1
      AND id = $2
      AND ${EMBEDDING_COLUMNS.content_sha256} = $3
      AND ${EMBEDDING_COLUMNS.input_sha256} = $3
      AND ${EMBEDDING_COLUMNS.embedding} IS NOT NULL
      AND ${EMBEDDING_COLUMNS.created_at} IS NOT NULL
  `,
    [message.support_thread_id, message.id, content_sha256],
  )
  if (rows.length > 0) return

  const existingEmbedding = await lookupExistingEmbedding(content_sha256)

  if (existingEmbedding) {
    await write(
      `/* upsertSupportMessageEmbedding:cache-hit */
      UPDATE support_messages AS entity
      SET ${EMBEDDING_COLUMNS.content_sha256} = existing.content_sha256,
          ${EMBEDDING_COLUMNS.input_sha256} = existing.content_sha256,
          ${EMBEDDING_COLUMNS.embedding} = existing.embedding,
          ${EMBEDDING_COLUMNS.created_at} = NOW(),
          ${EMBEDDING_COLUMNS.input_token_count} = COALESCE(
            existing.input_token_count,
            entity.${EMBEDDING_COLUMNS.input_token_count}
          )
      FROM ${EMBEDDINGS_TABLE} existing
      WHERE existing.content_sha256 = $1
        AND entity.support_thread_id = $2
        AND entity.id = $3
    `,
      [content_sha256, message.support_thread_id, message.id],
    )
    return
  }

  const result = await createBedrockEmbedding(content, {
    entityType: 'support_message',
  })
  const embedding = requireDenseEmbedding(result.embedding)
  const input_token_count = result.tokens
  await insertCentralizedEmbeddingsBulk([{ content_sha256, embedding, input_token_count }])

  await write(
    `/* upsertSupportMessageEmbedding:update */
    UPDATE support_messages
    SET ${EMBEDDING_COLUMNS.content_sha256} = $1,
        ${EMBEDDING_COLUMNS.input_sha256} = $2,
        ${EMBEDDING_COLUMNS.embedding} = $3,
        ${EMBEDDING_COLUMNS.created_at} = NOW(),
        ${EMBEDDING_COLUMNS.input_token_count} = COALESCE($4, ${EMBEDDING_COLUMNS.input_token_count})
    WHERE support_thread_id = $5
      AND id = $6
  `,
    [
      content_sha256,
      content_sha256,
      pgvector.toSql(embedding),
      input_token_count,
      message.support_thread_id,
      message.id,
    ],
  )
}
