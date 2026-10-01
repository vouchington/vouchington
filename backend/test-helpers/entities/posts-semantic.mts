/**
 * Posts semantic search test helpers
 */

import sql from 'sql-template-strings'
import { makeRandomEmbedding } from './embedding-vectors.mts'

/**
 * Add dummy embedding to a post for semantic search tests
 */
export async function addDummyEmbeddingToPost(
  postId: string,
  options?: {
    flagged?: boolean
    embedding?: number[]
    rankFirst?: boolean
  },
): Promise<void> {
  const vector = options?.embedding ?? makeRandomEmbedding()
  // Create 1024-dimension dummy embedding
  const dummyEmbedding = `[${vector.join(',')}]`

  const query = sql`
    UPDATE posts
    SET bedrock_nova_multimodal_v1_embedding = ${dummyEmbedding}::vector,
        bedrock_nova_multimodal_v1_embedding_created_at = ${options?.rankFirst ? '9999-01-01T00:00:00Z' : new Date().toISOString()}
  `

  if (options?.flagged) {
    query.append(sql`,
        approved_at = NULL,
        in_review_at = CURRENT_TIMESTAMP
    `)
  }

  query.append(sql`
    WHERE id = ${postId}
  `)

  const { write } = await import('@data-stores/psql')
  await write(query)
}

export async function setPostEmbeddingContentSha256KeepingInput(
  postId: string,
  contentSha256: Buffer,
): Promise<void> {
  const { write } = await import('@data-stores/psql')
  await write(sql`
    UPDATE posts
    SET bedrock_nova_multimodal_v1_content_sha256 = ${contentSha256}
    WHERE id = ${postId}
  `)
}
