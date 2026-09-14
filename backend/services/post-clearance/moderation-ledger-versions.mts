import { write, type QueryOptions } from '@data-stores/psql'
import {
  AUTOMATED_POST_MODERATION_SOURCES,
  POST_MODERATION_POLICY_REVISION,
  type RecordPostModerationDisposition,
} from './moderation-ledger-types.mts'

export type PostModerationVersion = {
  id: string
  post_id: string
  content_sha256: Buffer
  policy_revision: string
  deadline_at: Date
}

export async function ensureCurrentPostModerationVersion(
  postId: string,
  options: QueryOptions = {},
): Promise<PostModerationVersion> {
  const { rows } = await write<PostModerationVersion>(
    `/* ensureCurrentPostModerationVersion */
    WITH current_post AS (
      SELECT id, llm_moderation_content_sha256
      FROM posts
      WHERE id = $1
        AND deleted_at IS NULL
    ),
    inserted_version AS (
      INSERT INTO post_moderation_versions (post_id, content_sha256, policy_revision)
      SELECT id, llm_moderation_content_sha256, $2
      FROM current_post
      ORDER BY id ASC NULLS LAST,
        llm_moderation_content_sha256 ASC NULLS LAST,
        $2 ASC NULLS LAST
      ON CONFLICT (post_id, content_sha256, policy_revision) DO NOTHING
      RETURNING *
    ),
    selected_version AS (
      SELECT * FROM inserted_version
      UNION ALL
      SELECT version.*
      FROM post_moderation_versions version
      JOIN current_post post
        ON post.id = version.post_id
       AND post.llm_moderation_content_sha256 = version.content_sha256
      WHERE version.policy_revision = $2
        AND NOT EXISTS (SELECT 1 FROM inserted_version)
      LIMIT 1
    ),
    inserted_work AS (
      INSERT INTO post_moderation_work_items (version_id, source)
      SELECT selected_version.id, source::post_moderation_sources
      FROM selected_version
      CROSS JOIN unnest($3::text[]) AS source
      ORDER BY selected_version.id ASC NULLS LAST,
        source::post_moderation_sources ASC NULLS LAST
      ON CONFLICT (version_id, source) DO NOTHING
    )
    SELECT id, post_id, content_sha256, policy_revision, deadline_at
    FROM selected_version`,
    [postId, POST_MODERATION_POLICY_REVISION, [...AUTOMATED_POST_MODERATION_SOURCES]],
    options,
  )
  const version = rows[0]
  if (!version) throw new Error(`Post moderation version source post not found: ${postId}`)
  return version
}

export async function recordPostModerationDisposition(
  disposition: RecordPostModerationDisposition,
  options: QueryOptions = {},
): Promise<boolean> {
  const { rows } = await write(
    `/* recordPostModerationDisposition */
      WITH current_version AS (
        SELECT version.id
        FROM post_moderation_versions version
        JOIN posts post
          ON post.id = version.post_id
         AND post.llm_moderation_content_sha256 = version.content_sha256
        WHERE version.id = $1
          AND version.policy_revision = $8
          AND post.deleted_at IS NULL
      ),
      inserted AS (
        INSERT INTO post_moderation_dispositions (
          version_id, source, attempt_id, disposition, reason_code, evidence, actor_user_id
        )
        SELECT id, $2::post_moderation_sources, $3::uuid, $4::post_moderation_disposition_types,
          $5, $6::jsonb, $7
        FROM current_version
        ORDER BY $3::uuid ASC NULLS LAST
        ON CONFLICT (attempt_id) DO NOTHING
        RETURNING version_id, source
      )
      UPDATE post_moderation_work_items work
      SET completed_at = CASE WHEN $4::post_moderation_disposition_types = 'incomplete'
            THEN work.completed_at ELSE CURRENT_TIMESTAMP END,
          leased_at = NULL,
          lease_token = NULL,
          lease_expires_at = NULL
      FROM inserted
      WHERE work.version_id = inserted.version_id
        AND work.source = inserted.source
      RETURNING work.version_id`,
    [
      disposition.versionId,
      disposition.source,
      disposition.attemptId ?? null,
      disposition.disposition,
      disposition.reasonCode,
      JSON.stringify(disposition.evidence ?? {}),
      disposition.actorUserId ?? null,
      POST_MODERATION_POLICY_REVISION,
    ],
    options,
  )
  return rows.length > 0
}
