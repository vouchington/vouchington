import { read, write } from '@data-stores/psql'
import { insertTestCentralizedEmbeddingsBulk } from './_gemini-embeddings-support.mts'
import sql from 'sql-template-strings'
import pgvector from 'pgvector/pg'

export async function updatePostEmbeddingData(data: {
  postId: string
  inputSha256: Buffer
  embedding: number[]
  tokens: number
  createdAt?: Date
}): Promise<void> {
  const createdAt = data.createdAt || new Date()
  await insertTestCentralizedEmbeddingsBulk([
    {
      content_sha256: data.inputSha256,
      embedding: data.embedding,
    },
  ])
  await write(
    sql`/* updatePostEmbeddingData */
    UPDATE posts
    SET gemini_embedding_2_input_sha256 = ${data.inputSha256},
      gemini_embedding_2_embedding = ${pgvector.toSql(data.embedding)},
      gemini_embedding_2_embedding_created_at = ${createdAt}
    WHERE id = ${data.postId}
  `,
  )
}
export async function updatePostUpdatedAt(postId: string, updatedAt: Date): Promise<void> {
  await write(
    sql`/* updatePostUpdatedAt */
    UPDATE posts
    SET updated_at = ${updatedAt}
    WHERE id = ${postId}
  `,
  )
}
export async function getPostEmbeddingData(postId: string): Promise<{
  input_sha: Buffer | null
  created_at: Date | null
  ban_evasion_post_embedding_input_sha: Buffer | null
} | null> {
  const { rows } = await read<{
    input_sha: Buffer | null
    created_at: Date | null
    ban_evasion_post_embedding_input_sha: Buffer | null
  }>(
    sql`/* getPostEmbeddingData */
    SELECT
      gemini_embedding_2_input_sha256 AS input_sha,
      gemini_embedding_2_embedding_created_at AS created_at,
      ban_evasion_post_embedding_input_sha256 AS ban_evasion_post_embedding_input_sha
    FROM posts
    WHERE id = ${postId}
  `,
  )
  return rows[0] || null
}
