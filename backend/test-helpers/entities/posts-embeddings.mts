import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { read, write } from '@data-stores/psql'
import { insertTestCentralizedEmbeddingsBulk } from './_bedrock-embeddings-support.mts'
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
    allowUnannotatedQuery(sql`
    UPDATE posts
    SET bedrock_nova_multimodal_v1_input_sha256 = ${data.inputSha256},
      bedrock_nova_multimodal_v1_embedding = ${pgvector.toSql(data.embedding)},
      bedrock_nova_multimodal_v1_embedding_created_at = ${createdAt}
    WHERE id = ${data.postId}
  `),
  )
}
export async function updatePostUpdatedAt(postId: string, updatedAt: Date): Promise<void> {
  await write(
    allowUnannotatedQuery(sql`
    UPDATE posts
    SET updated_at = ${updatedAt}
    WHERE id = ${postId}
  `),
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
    allowUnannotatedQuery(sql`
    SELECT
      bedrock_nova_multimodal_v1_input_sha256 AS input_sha,
      bedrock_nova_multimodal_v1_embedding_created_at AS created_at,
      ban_evasion_post_embedding_input_sha256 AS ban_evasion_post_embedding_input_sha
    FROM posts
    WHERE id = ${postId}
  `),
  )
  return rows[0] || null
}
