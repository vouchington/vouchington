import { randomBytes, randomUUID } from 'node:crypto'
import type { TransactionQuery } from '@data-stores/psql'
import pgvector from 'pgvector/pg'

/** Every fixture row belongs to the caller's rollback transaction. */
export async function createEmbeddingCacheApplicationFixture(
  query: TransactionQuery,
  options: { cachedTokens: number | null; sameInput: boolean; changedContent: boolean },
) {
  const contentSha256 = randomBytes(32)
  const oldInputSha256 = options.sameInput ? contentSha256 : randomBytes(32)
  const currentContentSha256 = options.changedContent ? randomBytes(32) : contentSha256
  const { rows: users } = await query<{ id: string }>(
    `/* createEmbeddingCacheApplicationUser */ INSERT INTO users (username) VALUES (NULL) RETURNING id`,
  )
  const { rows: topics } = await query<{ id: string }>(
    `/* createEmbeddingCacheApplicationTopic */
    INSERT INTO topics (name, slug, created_by_id, created_via,
      gemini_embedding_2_content_sha256, gemini_embedding_2_input_sha256,
      gemini_embedding_2_embedding, gemini_embedding_2_input_token_count, bedrock_nova_multimodal_v1_content_sha256)
    VALUES ($1, $1, $2, 'system', $3, $4, $5, 7, $3) RETURNING id`,
    [
      randomUUID(),
      users[0]!.id,
      currentContentSha256,
      oldInputSha256,
      pgvector.toSql(new Array(1536).fill(0.125)),
    ],
  )
  await query(
    `/* createEmbeddingCacheApplicationCache */
    INSERT INTO gemini_embedding_2_embeddings
      (content_sha256, embedding, input_token_count, updated_at)
    VALUES ($1, $2, $3, $4)`,
    [
      contentSha256,
      pgvector.toSql(new Array(1536).fill(0.25)),
      options.cachedTokens,
      new Date('2026-06-01T12:00:00Z'),
    ],
  )
  const { rows: cached } = await query<{ embedding: number[]; input_token_count: number | null }>(
    `/* captureEmbeddingCacheApplicationValue */
    SELECT embedding, input_token_count FROM gemini_embedding_2_embeddings
    WHERE content_sha256 = $1`,
    [contentSha256],
  )
  return {
    target: { type: 'topic' as const, id: topics[0]!.id },
    contentSha256,
    oldInputSha256,
    captured: cached[0]!,
    evict: async () => {
      const { rowCount } = await query(
        `/* evictEmbeddingCacheApplicationValue */
        DELETE FROM gemini_embedding_2_embeddings WHERE content_sha256 = $1`,
        [contentSha256],
      )
      return rowCount
    },
    state: async () => {
      const { rows } = await query<{
        cacheExists: boolean
        inputSha256: Buffer
        embedding: number[]
        tokens: number | null
      }>(
        `/* readEmbeddingCacheApplicationState */
        SELECT EXISTS (SELECT 1 FROM gemini_embedding_2_embeddings WHERE content_sha256 = $1) AS "cacheExists",
          gemini_embedding_2_input_sha256 AS "inputSha256",
          gemini_embedding_2_embedding AS embedding,
          gemini_embedding_2_input_token_count AS tokens
        FROM topics WHERE id = $2`,
        [contentSha256, topics[0]!.id],
      )
      return rows[0]!
    },
  }
}
