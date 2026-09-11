import { read, write, writePool } from '@data-stores/psql'
import { EMBEDDINGS_TABLE, embeddingBloomFilter } from './_bedrock-embeddings-support.mts'

export { makeRandomEmbedding, makeNearbyEmbedding } from './embedding-vectors.mts'

function generateMockEmbedding(): number[] {
  const embedding = new Array(1024).fill(0)
  for (let i = 0; i < 1024; i++) {
    embedding[i] = Math.sin(i / 100) * 0.5
  }
  return embedding
}

export async function insertTestEmbeddings(
  embeddings: Array<{
    content_sha256: Buffer
    tokens?: number
    embedding?: number[]
  }>,
): Promise<void> {
  if (embeddings.length === 0) return

  const client = await writePool.connect()
  try {
    const placeholders = embeddings.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(',')
    const values: unknown[] = []
    for (const emb of embeddings) {
      const vector = emb.embedding || generateMockEmbedding()
      values.push(emb.content_sha256, JSON.stringify(vector))
    }

    await write(
      `INSERT INTO ${EMBEDDINGS_TABLE} (content_sha256, embedding)
       VALUES ${placeholders}`,
      values,
      { client },
    )
  } finally {
    client.release()
  }
}

export async function getEmbeddingByContentSha256(contentSha256: Buffer) {
  const { rows } = await read(
    `SELECT content_sha256, embedding, created_at FROM ${EMBEDDINGS_TABLE} WHERE content_sha256 = $1`,
    [contentSha256],
  )
  return rows[0] ?? null
}

export async function countEmbeddingsByContentSha256(contentSha256: Buffer): Promise<number> {
  const { rows } = await read(
    `SELECT COUNT(*)::int AS count FROM ${EMBEDDINGS_TABLE} WHERE content_sha256 = $1`,
    [contentSha256],
  )
  return rows[0]?.count ?? 0
}

export async function countAllEmbeddings(): Promise<number> {
  const { rows } = await read(`SELECT COUNT(*)::int AS count FROM ${EMBEDDINGS_TABLE}`)
  return rows[0]?.count ?? 0
}

export async function setTopicEmbeddingContentSha256(
  topicId: string,
  contentSha256: Buffer,
): Promise<void> {
  await write(`UPDATE topics SET bedrock_nova_multimodal_v1_content_sha256 = $1 WHERE id = $2`, [
    contentSha256,
    topicId,
  ])
}

export async function setTopicEmbeddingContentAndInputSha256(
  topicId: string,
  contentSha256: Buffer,
): Promise<void> {
  await write(
    `UPDATE topics
     SET bedrock_nova_multimodal_v1_content_sha256 = $1,
         bedrock_nova_multimodal_v1_input_sha256 = $1
     WHERE id = $2`,
    [contentSha256, topicId],
  )
}

export async function setTopicNameAndEmbeddingContentSha256(
  topicId: string,
  name: string,
  contentSha256: Buffer,
): Promise<void> {
  await write(
    `
    UPDATE topics
    SET name = $1,
        bedrock_nova_multimodal_v1_content_sha256 = $2
    WHERE id = $3
  `,
    [name, contentSha256, topicId],
  )
}

export async function getTopicEmbeddingReference(topicId: string) {
  const { rows } = await read(
    `
    SELECT bedrock_nova_multimodal_v1_content_sha256, bedrock_nova_multimodal_v1_embedding_created_at
    FROM topics
    WHERE id = $1
  `,
    [topicId],
  )
  return rows[0] ?? null
}

export async function setPostEmbeddingContentSha256(
  postId: string,
  contentSha256: Buffer,
): Promise<void> {
  await write(
    `UPDATE posts
     SET bedrock_nova_multimodal_v1_content_sha256 = $1,
         bedrock_nova_multimodal_v1_input_sha256 = $1,
         bedrock_nova_multimodal_v1_embedding_created_at = NOW()
     WHERE id = $2`,
    [contentSha256, postId],
  )
}

export async function setPostEmbeddingContentOnlySha256(
  postId: string,
  contentSha256: Buffer,
): Promise<void> {
  await write(
    `UPDATE posts
     SET bedrock_nova_multimodal_v1_content_sha256 = $1,
         bedrock_nova_multimodal_v1_input_sha256 = NULL,
         bedrock_nova_multimodal_v1_embedding = NULL,
         bedrock_nova_multimodal_v1_embedding_created_at = NULL
     WHERE id = $2`,
    [contentSha256, postId],
  )
}

export async function getEmbeddingsJoinForPost(postId: string) {
  const { rows } = await read(
    `
    SELECT posts.id, emb.embedding
    FROM posts
    INNER JOIN ${EMBEDDINGS_TABLE} emb
      ON posts.bedrock_nova_multimodal_v1_content_sha256 = emb.content_sha256
    WHERE posts.id = $1
      AND posts.bedrock_nova_multimodal_v1_embedding_created_at IS NOT NULL
  `,
    [postId],
  )
  return rows
}

export async function getBatchMetadata(batchId: string) {
  const { rows } = await read(
    'SELECT records::int, job_type, model_id FROM bedrock_embeddings_batches WHERE id = $1',
    [batchId],
  )
  return rows[0] ?? null
}

export async function insertEmbeddingIfMissing(
  contentSha256: Buffer,
  embeddingSql: string,
  _tokens?: number,
): Promise<void> {
  await write(
    `
    INSERT INTO ${EMBEDDINGS_TABLE} (
      content_sha256,
      embedding
    ) VALUES ($1, $2)
    ON CONFLICT (content_sha256) DO NOTHING
  `,
    [contentSha256, embeddingSql],
  )
  // Keep the bloom filter in sync so lookupExistingEmbedding can find the entry.
  // Ensure the key exists with the correct configuration before adding — BF.MADD
  // without a prior BF.RESERVE can create the key with default (wrong) params.
  await embeddingBloomFilter.ensureExists()
  await embeddingBloomFilter.add([contentSha256.toString('hex')])
}
