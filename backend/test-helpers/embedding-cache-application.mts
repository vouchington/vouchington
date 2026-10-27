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
      bedrock_nova_multimodal_v1_content_sha256, bedrock_nova_multimodal_v1_input_sha256,
      bedrock_nova_multimodal_v1_embedding, bedrock_nova_multimodal_v1_input_token_count)
    VALUES ($1, $1, $2, 'system', $3, $4, $5, 7) RETURNING id`,
    [
      randomUUID(),
      users[0]!.id,
      currentContentSha256,
      oldInputSha256,
      pgvector.toSql(new Array(1024).fill(0.125)),
    ],
  )
  await query(
    `/* createEmbeddingCacheApplicationCache */
    INSERT INTO bedrock_nova_multimodal_v1_embeddings
      (content_sha256, embedding, input_token_count, updated_at)
    VALUES ($1, $2, $3, $4)`,
    [
      contentSha256,
      pgvector.toSql(new Array(1024).fill(0.25)),
      options.cachedTokens,
      new Date('2026-06-01T12:00:00Z'),
    ],
  )
  const { rows: cached } = await query<{ embedding: number[]; input_token_count: number | null }>(
    `/* captureEmbeddingCacheApplicationValue */
    SELECT embedding, input_token_count FROM bedrock_nova_multimodal_v1_embeddings
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
        DELETE FROM bedrock_nova_multimodal_v1_embeddings WHERE content_sha256 = $1`,
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
        SELECT EXISTS (SELECT 1 FROM bedrock_nova_multimodal_v1_embeddings WHERE content_sha256 = $1) AS "cacheExists",
          bedrock_nova_multimodal_v1_input_sha256 AS "inputSha256",
          bedrock_nova_multimodal_v1_embedding AS embedding,
          bedrock_nova_multimodal_v1_input_token_count AS tokens
        FROM topics WHERE id = $2`,
        [contentSha256, topics[0]!.id],
      )
      return rows[0]!
    },
  }
}
