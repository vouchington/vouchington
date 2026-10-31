import type { QueryExecutor } from '@data-stores/psql'
import { POST_MODERATION_POLICY_REVISION } from '@services/post-clearance/moderation-ledger-types'

const ZERO_UUID = '00000000-0000-0000-0000-000000000000'

export async function reconsiderChangedPostModerationPost(
  query: QueryExecutor,
  batchSize: number,
  revision = POST_MODERATION_POLICY_REVISION,
): Promise<{ processed: boolean; hasMore: boolean }> {
  const { rows } = await query<{ post_id: string }>(
    `/* listChangedPostModerationRetentionPost */
     SELECT post_id FROM post_moderation_retention_post_work_items
     ORDER BY changed_at, post_id LIMIT 1`,
  )
  if (!rows[0]) return { processed: false, hasMore: false }
  return reconsiderChangedPostModerationPostById(query, rows[0].post_id, batchSize, revision)
}

/** One post and one bounded disposition subpage, under the caller's transaction. */
export async function reconsiderChangedPostModerationPostById(
  query: QueryExecutor,
  postId: string,
  batchSize: number,
  revision = POST_MODERATION_POLICY_REVISION,
): Promise<{ processed: boolean; hasMore: boolean }> {
  await query(
    `/* lockChangedPostModerationRetentionPost */
     SELECT id FROM posts WHERE id = $1::uuid FOR SHARE`,
    [postId],
  )
  const { rows: work } = await query<{
    cursor_version_record_id: string
    cursor_processing_version_record_id: string | null
    cursor_disposition_record_id: string
  }>(
    `/* lockChangedPostModerationRetentionWork */
     SELECT cursor_version_record_id, cursor_processing_version_record_id,
       cursor_disposition_record_id
     FROM post_moderation_retention_post_work_items
     WHERE post_id = $1::uuid FOR UPDATE`,
    [postId],
  )
  if (!work[0]) return { processed: false, hasMore: true }
  const { rows: versions } = await query<{ id: string; is_current: boolean }>(
    `/* listChangedPostModerationRetentionVersions */
     SELECT version.id,
       (version.content_sha256 = post.llm_moderation_content_sha256
        AND version.policy_revision = $3) IS TRUE AS is_current
     FROM post_moderation_versions version JOIN posts post ON post.id = version.post_id
     WHERE version.post_id = $1::uuid AND version.id > $2::uuid
       AND version.retention_hash_blocked_at IS NOT NULL
     ORDER BY version.id LIMIT 1`,
    [postId, work[0].cursor_version_record_id, revision],
  )
  const version = versions[0]
  if (!version) return finishPostModerationHashWork(query, postId)
  const { rows: dispositions } = await query<{ id: string }>(
    `/* listChangedPostModerationRetentionDispositions */
     SELECT id FROM post_moderation_dispositions
     WHERE version_id = $1::uuid AND id > $2::uuid
       AND disposition = 'pass' AND source <> 'staff' AND evidence <> '{}'::jsonb
     ORDER BY id LIMIT $3`,
    [
      version.id,
      work[0].cursor_processing_version_record_id === version.id
        ? work[0].cursor_disposition_record_id
        : ZERO_UUID,
      batchSize + 1,
    ],
  )
  const page = dispositions.slice(0, batchSize)
  await query(
    `/* reconsiderChangedPostModerationRetentionVersion */
     UPDATE post_moderation_versions
     SET retention_due_at = retention_successor_at
     WHERE id = $1::uuid AND $2::boolean = FALSE
       AND retention_successor_at IS NOT NULL AND retention_due_at IS NULL`,
    [version.id, version.is_current],
  )
  if (page.length > 0) {
    await query(
      `/* reconsiderChangedPostModerationRetentionDispositions */
       UPDATE post_moderation_dispositions
       SET retention_due_at = CASE WHEN $2::boolean THEN uuid_extract_timestamp(id) ELSE NULL END
       WHERE id = ANY($1::uuid[]) AND version_id = $3::uuid
         AND disposition = 'pass' AND source <> 'staff' AND evidence <> '{}'::jsonb
         AND retention_due_at IS DISTINCT FROM
           CASE WHEN $2::boolean THEN uuid_extract_timestamp(id) ELSE NULL END`,
      [page.map(row => row.id), version.is_current, version.id],
    )
  }
  if (dispositions.length > batchSize) {
    await query(
      `/* advancePostModerationRetentionDispositionCursor */
       UPDATE post_moderation_retention_post_work_items
       SET cursor_processing_version_record_id = $2::uuid,
           cursor_disposition_record_id = $3::uuid WHERE post_id = $1::uuid`,
      [postId, version.id, page.at(-1)!.id],
    )
    return { processed: true, hasMore: true }
  }
  await query(
    `/* finishChangedPostModerationRetentionVersion */
     UPDATE post_moderation_versions version
     SET retention_hash_blocked_at = CASE
       WHEN (version.retention_successor_at IS NOT NULL AND version.retention_due_at IS NULL)
         OR EXISTS (
           SELECT 1 FROM post_moderation_dispositions disposition
           WHERE disposition.version_id = version.id AND disposition.disposition = 'pass'
             AND disposition.source <> 'staff' AND disposition.evidence <> '{}'::jsonb
             AND disposition.retention_due_at IS NULL LIMIT 1
         ) THEN COALESCE(version.retention_hash_blocked_at, CURRENT_TIMESTAMP)
       ELSE NULL END
     WHERE version.id = $1::uuid`,
    [version.id],
  )
  const { rows: next } = await query<{ id: string }>(
    `/* hasChangedPostModerationRetentionVersions */
     SELECT id FROM post_moderation_versions
     WHERE post_id = $1::uuid AND id > $2::uuid
       AND retention_hash_blocked_at IS NOT NULL LIMIT 1`,
    [postId, version.id],
  )
  if (!next[0]) return finishPostModerationHashWork(query, postId)
  await query(
    `/* advancePostModerationRetentionVersionCursor */
     UPDATE post_moderation_retention_post_work_items
     SET cursor_version_record_id = $2::uuid,
         cursor_processing_version_record_id = NULL,
         cursor_disposition_record_id = $3::uuid
     WHERE post_id = $1::uuid`,
    [postId, version.id, ZERO_UUID],
  )
  return { processed: true, hasMore: true }
}

async function finishPostModerationHashWork(
  query: QueryExecutor,
  postId: string,
): Promise<{ processed: boolean; hasMore: boolean }> {
  await query(
    `/* finishPostModerationRetentionPostWork */
     DELETE FROM post_moderation_retention_post_work_items WHERE post_id = $1::uuid`,
    [postId],
  )
  const { rows } = await query<{ post_id: string }>(
    `/* hasChangedPostModerationRetentionPosts */
     SELECT post_id FROM post_moderation_retention_post_work_items LIMIT 1`,
  )
  return { processed: true, hasMore: rows.length > 0 }
}
