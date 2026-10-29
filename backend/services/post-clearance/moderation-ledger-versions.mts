import { write, type QueryOptions } from '@data-stores/psql'
import { readCommittedCurrentPostModerationVersion } from './moderation-ledger-committed-version.mts'
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

// The post row lock serializes version inserts per post: the retention trigger links each new
// version to its predecessor, and two concurrent inserts would otherwise not see each other.
// Lock order is publication fence, then post, then moderation work and sources.
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
      FOR NO KEY UPDATE
    ),
    inserted_version AS (
      INSERT INTO post_moderation_versions (post_id, content_sha256, policy_revision)
      SELECT id, llm_moderation_content_sha256, $2
      FROM current_post
      ORDER BY id ASC NULLS LAST,
        llm_moderation_content_sha256 ASC NULLS LAST,
        $2 ASC NULLS LAST
      ON CONFLICT (post_id, content_sha256, policy_revision) DO NOTHING
      RETURNING id, post_id, content_sha256, policy_revision, deadline_at
    ),
    selected_version AS (
      SELECT * FROM inserted_version
      UNION ALL
      SELECT version.id, version.post_id, version.content_sha256, version.policy_revision, version.deadline_at
      FROM post_moderation_versions version
      JOIN current_post post
        ON post.id = version.post_id
       AND post.llm_moderation_content_sha256 = version.content_sha256
      WHERE version.policy_revision = $2
        AND NOT EXISTS (SELECT 1 FROM inserted_version)
      LIMIT 1
    ),
    inserted_attempts AS (
      INSERT INTO post_moderation_attempts (version_id, source, attempt_number)
      SELECT selected_version.id, source::post_moderation_sources, 1
      FROM selected_version
      CROSS JOIN unnest($3::text[]) AS source
      WHERE NOT EXISTS (
        SELECT 1 FROM post_moderation_dispositions disposition
        WHERE disposition.version_id = selected_version.id
          AND disposition.source = source::post_moderation_sources
          AND disposition.disposition <> 'incomplete'
      )
      ORDER BY selected_version.id ASC NULLS LAST,
        source::post_moderation_sources ASC NULLS LAST
      ON CONFLICT (version_id, source) DO NOTHING
    )
    SELECT id, post_id, content_sha256, policy_revision, deadline_at
    FROM selected_version`,
    [postId, POST_MODERATION_POLICY_REVISION, [...AUTOMATED_POST_MODERATION_SOURCES]],
    options,
  )
  const version = rows[0] ?? (await readCommittedCurrentPostModerationVersion(postId, options))
  if (!version) throw new Error(`Post moderation version source post not found: ${postId}`)
  return version
}

/** One statement for a bounded backfill page. Missing posts are omitted. */
export async function commitCurrentPostModerationVersions(
  postIds: readonly string[],
): Promise<PostModerationVersion[]> {
  if (postIds.length === 0) return []
  const { rows } = await write<PostModerationVersion>(
    `/* commitCurrentPostModerationVersions */
    WITH current_posts AS (
      SELECT id, llm_moderation_content_sha256
      FROM posts
      WHERE id = ANY($1::uuid[])
        AND deleted_at IS NULL
      ORDER BY id ASC NULLS LAST
      FOR NO KEY UPDATE
    ),
    inserted_version AS (
      INSERT INTO post_moderation_versions (post_id, content_sha256, policy_revision)
      SELECT id, llm_moderation_content_sha256, $2
      FROM current_posts
      ORDER BY id ASC NULLS LAST,
        llm_moderation_content_sha256 ASC NULLS LAST,
        $2 ASC NULLS LAST
      ON CONFLICT (post_id, content_sha256, policy_revision) DO NOTHING
      RETURNING id, post_id, content_sha256, policy_revision, deadline_at
    ),
    selected_version AS (
      SELECT * FROM inserted_version
      UNION ALL
      SELECT version.id, version.post_id, version.content_sha256, version.policy_revision,
        version.deadline_at
      FROM post_moderation_versions version
      JOIN current_posts post
        ON post.id = version.post_id
       AND post.llm_moderation_content_sha256 = version.content_sha256
      WHERE version.policy_revision = $2
        AND NOT EXISTS (
          SELECT 1 FROM inserted_version inserted WHERE inserted.post_id = version.post_id
        )
    ),
    inserted_attempts AS (
      INSERT INTO post_moderation_attempts (version_id, source, attempt_number)
      SELECT selected_version.id, source::post_moderation_sources, 1
      FROM selected_version
      CROSS JOIN unnest($3::text[]) AS source
      ORDER BY selected_version.id ASC NULLS LAST,
        source::post_moderation_sources ASC NULLS LAST
      ON CONFLICT (version_id, source) DO NOTHING
    )
    SELECT id, post_id, content_sha256, policy_revision, deadline_at
    FROM selected_version`,
    [postIds, POST_MODERATION_POLICY_REVISION, [...AUTOMATED_POST_MODERATION_SOURCES]],
  )
  return rows
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
        WHERE $2::post_moderation_sources = 'staff'
          OR NOT EXISTS (
            SELECT 1 FROM post_moderation_dispositions existing
            WHERE existing.version_id = current_version.id
              AND existing.source = $2::post_moderation_sources
          )
        ORDER BY $3::uuid ASC NULLS LAST
        ON CONFLICT (attempt_id) DO NOTHING
        RETURNING version_id
      )
      SELECT version_id FROM inserted`,
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
