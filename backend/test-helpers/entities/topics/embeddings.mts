import { read, write } from '@data-stores/psql'
import { insertTestCentralizedEmbeddingsBulk } from '../_bedrock-embeddings-support.mts'
import sql from 'sql-template-strings'
import pgvector from 'pgvector/pg'

export async function getTopicEmbeddingData(topicId: string): Promise<unknown | null> {
  const { rows } = await read(sql`
    SELECT
      bedrock_nova_multimodal_v1_content_sha256,
      bedrock_nova_multimodal_v1_input_sha256,
      bedrock_nova_multimodal_v1_embedding,
      bedrock_nova_multimodal_v1_embedding_created_at
    FROM topics
    WHERE id = ${topicId}
  `)
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
  await write(sql`
    UPDATE topics
    SET bedrock_nova_multimodal_v1_input_sha256 = ${data.inputSha256},
      bedrock_nova_multimodal_v1_embedding = ${pgvector.toSql(data.embedding)},
      bedrock_nova_multimodal_v1_embedding_created_at = ${createdAt}
    WHERE id = ${data.topicId}
  `)
}
