import { EMBEDDING_COLUMNS, EMBEDDINGS_TABLE, TABLE_MAP } from '../config.mts'
import { createBedrockEmbedding } from './request.mts'
import { requireDenseEmbedding } from './require-dense-embedding.mts'
import { lookupExistingEmbedding } from '../lookup.mts'
import { insertCentralizedEmbeddingsBulk } from '../centralized-table.mts'
import { isEntityLockedForBatch } from '../batch/locks.mts'
import { sha256 } from '@modules/utils'
import { write } from '@data-stores/psql'
import pgvector from 'pgvector/pg'
import { trackAIEmbeddingShortCircuit } from '@services/analytics'

type CreateEmbeddingJobData = {
  type: 'post' | 'topic' | 'rss_feed_item'
  id: string
  content: string
}

export const createSingleEmbedding = async (data: CreateEmbeddingJobData): Promise<void> => {
  const content_sha256 = sha256(data.content)
  const tableName = TABLE_MAP[data.type]

  if (await isEntityLockedForBatch(data.type, data.id)) {
    trackAIEmbeddingShortCircuit({ reason: 'batch_lock', entityType: data.type })
    return
  }

  const existingEmbedding = await lookupExistingEmbedding(content_sha256)

  if (existingEmbedding) {
    trackAIEmbeddingShortCircuit({ reason: 'centralized_cache', entityType: data.type })
    await write(
      `/* createSingleEmbedding cache-hit */
      UPDATE ${tableName} AS entity
      SET ${EMBEDDING_COLUMNS.input_sha256} = existing.content_sha256,
        ${EMBEDDING_COLUMNS.embedding} = existing.embedding,
        ${EMBEDDING_COLUMNS.created_at} = NOW(),
        ${EMBEDDING_COLUMNS.input_token_count} = COALESCE(
          existing.input_token_count,
          entity.${EMBEDDING_COLUMNS.input_token_count}
        )
      FROM ${EMBEDDINGS_TABLE} existing
      WHERE existing.content_sha256 = $1
        AND entity.id = $2
        AND entity.${EMBEDDING_COLUMNS.content_sha256} = $1
    `,
      [content_sha256, data.id],
    )
    return
  }

  const result = await createBedrockEmbedding(data.content, {
    entityType: data.type,
  })
  const embedding = requireDenseEmbedding(result.embedding)
  const input_token_count = result.tokens

  await insertCentralizedEmbeddingsBulk([{ content_sha256, embedding, input_token_count }])

  await write(
    `/* createSingleEmbedding */
    UPDATE ${tableName}
    SET ${EMBEDDING_COLUMNS.input_sha256} = $1,
      ${EMBEDDING_COLUMNS.embedding} = $2,
      ${EMBEDDING_COLUMNS.created_at} = NOW(),
      ${EMBEDDING_COLUMNS.input_token_count} = COALESCE($4, ${EMBEDDING_COLUMNS.input_token_count})
    WHERE id = $5
      AND ${EMBEDDING_COLUMNS.content_sha256} = $3
  `,
    [content_sha256, pgvector.toSql(embedding), content_sha256, input_token_count, data.id],
  )
}
