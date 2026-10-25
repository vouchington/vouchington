import { getCommunitiesWorkLimit } from '@services/communities/work-limits'
import { write } from '@data-stores/psql'
import { enqueueBulkDetectBanEvasionAfterPostEmbeddings } from '@queues/moderation-signals/enqueues'
import { decodeScopedUuidCursor, encodeScopedUuidCursor } from '@modules/pagination'
import sql from 'sql-template-strings'
import {
  markSkippedPostBanEvasionEmbeddings,
  markEnqueuedPostBanEvasionEmbeddings,
  type SkippedPostBanEvasionEmbedding,
} from '@services/posts/ban-evasion-embeddings'

const RECOVERY_CURSOR_SCOPE = 'ban-evasion:post-embedding:pending:id-asc'

type RecoveryPage = { enqueuedCount: number; scannedCount: number; nextCursor: string | null }

export async function enqueueBanEvasionDetectionForEmbeddedFirstCommunityPosts(
  postIds: string[],
): Promise<void> {
  const EMBEDDED_FIRST_COMMUNITY_POSTS_CHUNK_SIZE = getCommunitiesWorkLimit(
    'embedded_first_posts_chunk_size',
  )
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

export async function enqueueBanEvasionDetectionForCurrentEmbeddedFirstCommunityPosts(
  options: { after?: string; limit?: number } = {},
): Promise<RecoveryPage> {
  const configuredLimit = getCommunitiesWorkLimit('recovery_page_size')
  const requestedLimit = options.limit ?? configuredLimit
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
    throw new Error('Invalid ban-evasion recovery page size')
  }
  const limit = Math.min(requestedLimit, configuredLimit)
  const afterId =
    options.after !== undefined
      ? decodeScopedUuidCursor(options.after, RECOVERY_CURSOR_SCOPE, 'Invalid ban-evasion cursor')
          .id
      : null
  // Keep the fixed tombstone literal planner-provable against the partial index in generic plans.
  const candidateQuery = sql`/* enqueueBanEvasionDetectionForCurrentEmbeddedFirstCommunityPosts */
    WITH pending_page AS MATERIALIZED (
      SELECT p.id, p.created_by_id, p.community_id,
        p.bedrock_nova_multimodal_v1_input_sha256 AS input_sha256
      -- no-mistakes-disable-next-line postgres-required-predicates: global recovery must find pending embedded posts in every ID partition, including before the first cursor
      FROM posts p
      WHERE p.community_id IS NOT NULL
        AND p.created_by_id IS NOT NULL
        AND p.created_by_id != '00000000-0000-7000-8000-000000000000'::uuid
        AND p.deleted_at IS NULL
        AND p.bedrock_nova_multimodal_v1_embedding IS NOT NULL
        AND p.bedrock_nova_multimodal_v1_embedding_created_at IS NOT NULL
        AND p.bedrock_nova_multimodal_v1_input_sha256 = p.bedrock_nova_multimodal_v1_content_sha256
        AND (
          p.ban_evasion_post_embedding_input_sha256 IS NULL
          OR p.ban_evasion_post_embedding_input_sha256 != p.bedrock_nova_multimodal_v1_input_sha256
        )
  `
  if (afterId) candidateQuery.append(sql` AND p.id > ${afterId}::uuid`)
  candidateQuery.append(sql`
      ORDER BY p.id
      LIMIT ${limit}
    )
    SELECT p.id, p.created_by_id, p.community_id, p.input_sha256, (
      SELECT first_post.id
      -- no-mistakes-disable-next-line postgres-required-predicates: an earlier post can be attached to this community later, so finding the first post requires all ID partitions
      FROM posts first_post
      WHERE first_post.created_by_id = p.created_by_id
        AND first_post.community_id = p.community_id
        AND first_post.deleted_at IS NULL
      ORDER BY first_post.id ASC
      LIMIT 1
    ) AS first_post_id
    FROM pending_page p
    ORDER BY p.id
  `)
  const { rows: scanned } = await write<
    Omit<SkippedPostBanEvasionEmbedding, 'first_post_id'> & { first_post_id: string | null }
  >(candidateQuery)
  const scannedCount = scanned.length
  const nextCursor =
    scannedCount === limit
      ? encodeScopedUuidCursor(scanned[scannedCount - 1]!.id, RECOVERY_CURSOR_SCOPE)
      : null
  const skipped = scanned.filter(
    (row): row is SkippedPostBanEvasionEmbedding =>
      row.first_post_id !== null && row.first_post_id < row.id,
  )
  await markSkippedPostBanEvasionEmbeddings(skipped)
  const candidates = scanned.filter(row => row.first_post_id === row.id)
  if (candidates.length === 0) return { enqueuedCount: 0, scannedCount, nextCursor }

  const enqueuedCount = await enqueueBanEvasionDetectionForEmbeddedFirstCommunityPostChunk(
    candidates.map(row => row.id),
  )
  return { enqueuedCount, scannedCount, nextCursor }
}

async function enqueueBanEvasionDetectionForEmbeddedFirstCommunityPostChunk(
  postIds: string[],
): Promise<number> {
  const query = sql`/* enqueueBanEvasionDetectionForEmbeddedFirstCommunityPostChunk */
    SELECT p.id AS post_id,
      p.community_id,
      p.created_by_id AS user_id,
      p.bedrock_nova_multimodal_v1_input_sha256 AS input_sha256
    FROM posts p
    WHERE p.id = ANY(${postIds}::uuid[])
      AND p.community_id IS NOT NULL
      AND p.created_by_id IS NOT NULL
      AND p.created_by_id != '00000000-0000-7000-8000-000000000000'::uuid
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
        -- no-mistakes-disable-next-line postgres-required-predicates: this mixed-community batch has no safe parent-ID bound and an earlier post may have been attached later
        FROM posts first_post
        WHERE first_post.created_by_id = p.created_by_id
          AND first_post.community_id = p.community_id
          AND first_post.deleted_at IS NULL
        ORDER BY first_post.id ASC
        LIMIT 1
      )
    ORDER BY p.id
  `
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
    await markEnqueuedPostBanEvasionEmbeddings(rows)
  }

  return rows.length
}
