import { write, type TransactionQuery } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export type SkippedPostBanEvasionEmbedding = {
  id: string
  first_post_id: string
  created_by_id: string
  community_id: string
  input_sha256: Buffer
}

/** A live earlier post makes this input terminal until that earlier post leaves the scope. */
export async function markSkippedPostBanEvasionEmbeddings(
  rows: SkippedPostBanEvasionEmbedding[],
  options: QueryOptions = {},
): Promise<void> {
  if (rows.length === 0) return
  const lockedIds = [...new Set(rows.flatMap(row => [row.id, row.first_post_id]))].toSorted()
  const input = sql``
  rows.forEach((row, index) => {
    if (index > 0) input.append(sql`, `)
    input.append(sql`(${row.id}::uuid, ${row.first_post_id}::uuid,
      ${row.created_by_id}::uuid, ${row.community_id}::uuid, ${row.input_sha256}::bytea)`)
  })

  await write(
    sql`/* markSkippedPostBanEvasionEmbeddings */
    WITH locked_posts AS MATERIALIZED (
      SELECT id, created_by_id, community_id, deleted_at,
        bedrock_nova_multimodal_v1_input_sha256,
        bedrock_nova_multimodal_v1_content_sha256,
        bedrock_nova_multimodal_v1_embedding IS NOT NULL
          AND bedrock_nova_multimodal_v1_embedding_created_at IS NOT NULL AS has_embedding
      FROM posts
      WHERE id = ANY(${lockedIds}::uuid[])
      ORDER BY id
      LIMIT ${lockedIds.length}
      FOR NO KEY UPDATE
    ), skipped(post_id, first_post_id, user_id, community_id, input_sha256) AS (
      VALUES `.append(input).append(sql`
    )
    UPDATE posts p
    SET ban_evasion_post_embedding_input_sha256 = skipped.input_sha256
    FROM skipped
    JOIN locked_posts target ON target.id = skipped.post_id
    JOIN locked_posts earlier ON earlier.id = skipped.first_post_id
    WHERE p.id = target.id
      AND target.deleted_at IS NULL
      AND target.created_by_id = skipped.user_id
      AND target.community_id = skipped.community_id
      AND target.has_embedding
      AND target.bedrock_nova_multimodal_v1_input_sha256 = skipped.input_sha256
      AND target.bedrock_nova_multimodal_v1_content_sha256 = skipped.input_sha256
      AND earlier.id < target.id
      AND earlier.deleted_at IS NULL
      AND earlier.created_by_id = skipped.user_id
      AND earlier.community_id = skipped.community_id
  `),
    options,
  )
}

/** The immediate successor is the only post whose first-post eligibility can change next. */
export async function rearmNextPostBanEvasionEmbedding(
  query: TransactionQuery,
  deletedPostId: string,
): Promise<void> {
  await query(sql`/* rearmNextPostBanEvasionEmbedding */
    WITH deleted_post AS MATERIALIZED (
      SELECT id, created_by_id, community_id
      FROM posts
      WHERE id = ${deletedPostId}::uuid
        AND deleted_at IS NOT NULL
        AND created_by_id IS NOT NULL
        AND community_id IS NOT NULL
    ), successor AS MATERIALIZED (
      SELECT next_post.id
      FROM deleted_post
      JOIN LATERAL (
        SELECT p.id
        FROM posts p
        WHERE p.id > deleted_post.id
          AND p.created_by_id = deleted_post.created_by_id
          AND p.community_id = deleted_post.community_id
          AND p.deleted_at IS NULL
        ORDER BY p.id
        LIMIT 1
        FOR NO KEY UPDATE
      ) next_post ON true
    )
    UPDATE posts p
    SET ban_evasion_post_embedding_input_sha256 = NULL
    FROM successor
    WHERE p.id = successor.id
      AND p.deleted_at IS NULL
      AND p.ban_evasion_post_embedding_input_sha256 IS NOT NULL
  `)
}

export async function markEnqueuedPostBanEvasionEmbeddings(
  rows: Array<{ post_id: string; input_sha256: Buffer }>,
): Promise<void> {
  const updates = sql``
  rows.forEach((row, index) => {
    if (index > 0) updates.append(sql`, `)
    updates.append(sql`(${row.post_id}::uuid, ${row.input_sha256}::bytea)`)
  })

  await write(
    sql`/* markEnqueuedPostBanEvasionEmbeddings */
    UPDATE posts p
    SET ban_evasion_post_embedding_input_sha256 = enqueued.input_sha256
    FROM (VALUES `.append(updates).append(sql`) AS enqueued(post_id, input_sha256)
    WHERE p.id = enqueued.post_id
      AND p.bedrock_nova_multimodal_v1_input_sha256 = enqueued.input_sha256
      AND p.bedrock_nova_multimodal_v1_content_sha256 = enqueued.input_sha256
  `),
  )
}
