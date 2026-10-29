import { beginTransaction, write, type QueryOptions } from '@data-stores/psql'
import {
  AUTOMATED_POST_MODERATION_SOURCES,
  POST_MODERATION_POLICY_REVISION,
  type RecordPostModerationDisposition,
} from './moderation-ledger-types.mts'
import {
  captureCurrentPostVersionKeys,
  selectCapturedPostVersions,
} from './moderation-ledger-version-resolution.mts'
import { runPostClearanceTransaction } from './status-transaction.mts'

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
  return runPostClearanceTransaction(options, async query => {
    const keys = await captureCurrentPostVersionKeys(query, [postId])
    if (keys.length === 0)
      throw new Error(`Post moderation version source post not found: ${postId}`)
    const [version] = await selectCapturedPostVersions(query, keys)
    if (!version) throw new Error(`Post moderation version source post not found: ${postId}`)
    await query(
      `/* ensureCurrentPostModerationVersion:attempts */
      INSERT INTO post_moderation_attempts (version_id, source, attempt_number)
      SELECT $1::uuid, source::post_moderation_sources, 1
      FROM unnest($2::text[]) AS source
      WHERE NOT EXISTS (
        SELECT 1 FROM post_moderation_dispositions disposition
        WHERE disposition.version_id = $1::uuid
          AND disposition.source = source::post_moderation_sources
          AND disposition.disposition <> 'incomplete'
      )
      ORDER BY source::post_moderation_sources
      ON CONFLICT (version_id, source) DO NOTHING`,
      [version.id, [...AUTOMATED_POST_MODERATION_SOURCES]],
    )
    return version
  })
}

/** Commits a bounded backfill page; missing posts are omitted. */
export async function commitCurrentPostModerationVersions(
  postIds: readonly string[],
): Promise<PostModerationVersion[]> {
  if (postIds.length === 0) return []
  await using transaction = await beginTransaction()
  const keys = await captureCurrentPostVersionKeys(transaction, postIds)
  const versions = await selectCapturedPostVersions(transaction, keys)
  if (versions.length > 0) {
    await transaction(
      `/* commitCurrentPostModerationVersions:attempts */
      INSERT INTO post_moderation_attempts (version_id, source, attempt_number)
      SELECT version_id, source::post_moderation_sources, 1
      FROM unnest($1::uuid[]) AS version_id
      CROSS JOIN unnest($2::text[]) AS source
      ORDER BY version_id, source::post_moderation_sources
      ON CONFLICT (version_id, source) DO NOTHING`,
      [versions.map(version => version.id), [...AUTOMATED_POST_MODERATION_SOURCES]],
    )
  }
  await transaction.commit()
  return versions
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
