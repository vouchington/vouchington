import { read, write } from '@data-stores/psql'
import { insertTestCentralizedEmbeddingsBulk } from '../_gemini-embeddings-support.mts'
import sql from 'sql-template-strings'
import pgvector from 'pgvector/pg'

export async function getTopicEmbeddingData(topicId: string): Promise<unknown> {
  const { rows } = await read(
    sql`/* getTopicEmbeddingData */
    SELECT
      gemini_embedding_2_content_sha256,
      gemini_embedding_2_input_sha256,
      gemini_embedding_2_embedding,
      gemini_embedding_2_input_token_count,
      gemini_embedding_2_embedding_created_at
    FROM topics
    WHERE id = ${topicId}
  `,
  )
  return rows[0] || null
}

export async function updateTopicEmbeddingData(data: {
  topicId: string
  inputSha256: Buffer
  embedding: number[]
  tokens: number
  createdAt?: Date
}): Promise<void> {
  const createdAt = data.createdAt || new Date()
  await insertTestCentralizedEmbeddingsBulk([
    { content_sha256: data.inputSha256, embedding: data.embedding },
  ])
  await write(
    sql`/* updateTopicEmbeddingData */
    UPDATE topics
    SET gemini_embedding_2_input_sha256 = ${data.inputSha256},
      gemini_embedding_2_embedding = ${pgvector.toSql(data.embedding)},
      gemini_embedding_2_input_token_count = ${data.tokens},
      gemini_embedding_2_embedding_created_at = ${createdAt}
    WHERE id = ${data.topicId}
  `,
  )
}
