import type { TransactionQuery } from '@data-stores/psql/types'
import {
  POST_MODERATION_POLICY_REVISION,
  type PostModerationVersion,
} from './moderation-ledger-types.mts'

type CapturedPostVersionKey = {
  post_id: string
  content_sha256: Buffer
}

/** Captures the exact post content while admitting its immutable version. */
export async function captureCurrentPostVersionKeys(
  query: TransactionQuery,
  postIds: readonly string[],
): Promise<CapturedPostVersionKey[]> {
  const { rows } = await query<CapturedPostVersionKey>(
    `/* captureCurrentPostVersionKeys */
    WITH current_posts AS MATERIALIZED (
      SELECT id, llm_moderation_content_sha256
      FROM posts
      WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL
    ), inserted_version AS (
      INSERT INTO post_moderation_versions (post_id, content_sha256, policy_revision)
      SELECT id, llm_moderation_content_sha256, $2
      FROM current_posts
      ORDER BY id, llm_moderation_content_sha256
      ON CONFLICT (post_id, content_sha256, policy_revision) DO NOTHING
      RETURNING post_id
    )
    SELECT current_posts.id AS post_id,
      current_posts.llm_moderation_content_sha256 AS content_sha256
    FROM current_posts
    LEFT JOIN inserted_version ON inserted_version.post_id = current_posts.id`,
    [postIds, POST_MODERATION_POLICY_REVISION],
  )
  return rows
}

/** A new READ COMMITTED statement sees a conflict winner after DO NOTHING waited for its commit. */
export async function selectCapturedPostVersions(
  query: TransactionQuery,
  keys: readonly CapturedPostVersionKey[],
): Promise<PostModerationVersion[]> {
  if (keys.length === 0) return []
  const { rows } = await query<PostModerationVersion>(
    `/* selectCapturedPostVersions */
    SELECT version.id, version.post_id, version.content_sha256,
      version.policy_revision, version.deadline_at
    FROM unnest($1::uuid[], $2::text[]) AS captured(post_id, content_sha256_hex)
    JOIN post_moderation_versions version
      ON version.post_id = captured.post_id
     AND version.content_sha256 = decode(captured.content_sha256_hex, 'hex')
     AND version.policy_revision = $3`,
    [
      keys.map(key => key.post_id),
      keys.map(key => key.content_sha256.toString('hex')),
      POST_MODERATION_POLICY_REVISION,
    ],
  )
  if (rows.length !== keys.length) {
    throw new Error('Captured post moderation version was not committed')
  }
  return rows
}
