import { read, write } from '@data-stores/psql'
import { enqueueBulkDetectBanEvasionAfterPostEmbeddings } from '@queues/ban-evasion/enqueues'
import sql from 'sql-template-strings'

const EMBEDDED_FIRST_COMMUNITY_POSTS_CHUNK_SIZE = 1000

/** Returns true when this post is the user's first non-deleted post in the community. */
export async function isFirstCommunityPost(
  communityId: string,
  userId: string,
  postId: string,
): Promise<boolean> {
  const { rows } = await read<{ is_first: boolean }>(sql`/* isFirstCommunityPost */
    SELECT (
      SELECT id
      FROM posts
      WHERE created_by_id = ${userId}
        AND community_id = ${communityId}
        AND deleted_at IS NULL
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    ) = ${postId} AS is_first
  `)
  return rows[0]?.is_first ?? false
}

export async function enqueueBanEvasionDetectionForEmbeddedFirstCommunityPosts(
  postIds: string[],
): Promise<void> {
  if (postIds.length === 0) return

  const postIdChunks: string[][] = []
  for (let index = 0; index < postIds.length; index += EMBEDDED_FIRST_COMMUNITY_POSTS_CHUNK_SIZE) {
    postIdChunks.push(postIds.slice(index, index + EMBEDDED_FIRST_COMMUNITY_POSTS_CHUNK_SIZE))
  }

  await postIdChunks.reduce<Promise<void>>(async (previousChunk, postIdChunk) => {
    await previousChunk
    await enqueueBanEvasionDetectionForEmbeddedFirstCommunityPostChunk(postIdChunk)
  }, Promise.resolve())
}

export async function enqueueBanEvasionDetectionForCurrentEmbeddedFirstCommunityPosts(): Promise<void> {
  let enqueuedCount = 0
  do {
    /* oxlint-disable-next-line no-await-in-loop -- chunks are intentionally sequential for DB and Valkey backpressure */
    enqueuedCount = await enqueueBanEvasionDetectionForEmbeddedFirstCommunityPostChunk(null)
  } while (enqueuedCount === EMBEDDED_FIRST_COMMUNITY_POSTS_CHUNK_SIZE)
}

async function enqueueBanEvasionDetectionForEmbeddedFirstCommunityPostChunk(
  postIds: string[] | null,
): Promise<number> {
  const postIdFilter = postIds ? sql`AND p.id = ANY(${postIds}::uuid[])` : sql``
  const limit = postIds ? sql`` : sql`LIMIT ${EMBEDDED_FIRST_COMMUNITY_POSTS_CHUNK_SIZE}`
  const query = sql`/* enqueueBanEvasionDetectionForEmbeddedFirstCommunityPostChunk */
    SELECT p.id AS post_id,
      p.community_id,
      p.created_by_id AS user_id,
      p.bedrock_nova_multimodal_v1_input_sha256 AS input_sha256
    FROM posts p
    WHERE TRUE
  `
    .append(postIdFilter)
    .append(sql`
      AND p.community_id IS NOT NULL
      AND p.created_by_id IS NOT NULL
      AND p.deleted_at IS NULL
      AND p.bedrock_nova_multimodal_v1_embedding IS NOT NULL
      AND p.bedrock_nova_multimodal_v1_embedding_created_at IS NOT NULL
      AND p.bedrock_nova_multimodal_v1_input_sha256 = p.bedrock_nova_multimodal_v1_content_sha256
      AND (
        p.ban_evasion_post_embedding_input_sha256 IS NULL
        OR p.ban_evasion_post_embedding_input_sha256 != p.bedrock_nova_multimodal_v1_input_sha256
      )
      AND p.id = (
        SELECT first_post.id
        FROM posts first_post
        WHERE first_post.created_by_id = p.created_by_id
          AND first_post.community_id = p.community_id
          AND first_post.deleted_at IS NULL
        ORDER BY first_post.created_at ASC, first_post.id ASC
        LIMIT 1
      )
    ORDER BY p.id
  `)
    .append(limit)
  const { rows } = await write<{
    post_id: string
    community_id: string
    user_id: string
    input_sha256: Buffer
  }>(query)

  if (rows.length > 0) {
    await enqueueBulkDetectBanEvasionAfterPostEmbeddings(
      rows.map(row => ({
        postId: row.post_id,
        communityId: row.community_id,
        userId: row.user_id,
        inputSha256Hex: row.input_sha256.toString('hex'),
      })),
    )
    await markBanEvasionPostEmbeddingTriggerEnqueued(rows)
  }

  return rows.length
}

async function markBanEvasionPostEmbeddingTriggerEnqueued(
  rows: Array<{ post_id: string; input_sha256: Buffer }>,
): Promise<void> {
  const updates = sql``
  rows.forEach((row, index) => {
    if (index > 0) updates.append(sql`, `)
    updates.append(sql`(${row.post_id}::uuid, ${row.input_sha256}::bytea)`)
  })

  await write(
    sql`/* markBanEvasionPostEmbeddingTriggerEnqueued */
    UPDATE posts p
    SET ban_evasion_post_embedding_input_sha256 = enqueued.input_sha256
    FROM (VALUES `.append(updates).append(sql`) AS enqueued(post_id, input_sha256)
    WHERE p.id = enqueued.post_id
      AND p.bedrock_nova_multimodal_v1_input_sha256 = enqueued.input_sha256
  `),
  )
}
