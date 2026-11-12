import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
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
  // Create 1536-dimension dummy embedding
  const dummyEmbedding = `[${vector.join(',')}]`

  const query = sql`/* addDummyEmbeddingToPost */
    UPDATE posts
    SET gemini_embedding_2_embedding = ${dummyEmbedding}::halfvec(1536),
        gemini_embedding_2_embedding_created_at = ${options?.rankFirst ? '9999-01-01T00:00:00Z' : new Date().toISOString()}
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
  await write(
    allowUnannotatedQuery(sql`
    UPDATE posts
    SET gemini_embedding_2_content_sha256 = ${contentSha256}
    WHERE id = ${postId}
  `),
  )
}
