import { beginTransaction } from '@data-stores/psql'
import { POST_MODERATION_POLICY_REVISION } from '@services/post-clearance/moderation-ledger-types'
import type { PostModerationRetentionKind } from '@voucha/types/entities/moderation-retention'

export async function cleanupPostModerationLedgerPage(
  kind: PostModerationRetentionKind,
  batchSize: number,
  requestedUpperId: string,
  lowerId: string,
): Promise<{ changed: number; hasMore: boolean }> {
  await using query = await beginTransaction()
  await query(
    `/* cleanupPostModerationLedgerPage.ensureCursor */
     INSERT INTO post_moderation_retention_cursors (kind)
     VALUES ($1::post_moderation_retention_kinds) ON CONFLICT DO NOTHING`,
    [kind],
  )
  const { rows: cursors } = await query<{
    cursor_record_id: string | null
    sweep_lower_bound_record_id: string | null
    sweep_upper_bound_record_id: string | null
  }>(
    `/* cleanupPostModerationLedgerPage.lockCursor */
     SELECT cursor_record_id, sweep_lower_bound_record_id, sweep_upper_bound_record_id
     FROM post_moderation_retention_cursors
     WHERE kind = $1::post_moderation_retention_kinds FOR UPDATE`,
    [kind],
  )
  const cursor = cursors[0]
  if (!cursor) throw new Error(`Missing post moderation retention cursor: ${kind}`)
  // A caller can narrow the window, or increase retention while a pass is pending. Never
  // reuse progress wholly outside that window or a cutoff newer than the current policy allows.
  const resume =
    cursor.sweep_lower_bound_record_id !== null &&
    cursor.sweep_lower_bound_record_id <= lowerId &&
    cursor.sweep_upper_bound_record_id !== null &&
    cursor.sweep_upper_bound_record_id > lowerId &&
    cursor.sweep_upper_bound_record_id <= requestedUpperId &&
    (cursor.cursor_record_id === null ||
      cursor.cursor_record_id < cursor.sweep_upper_bound_record_id)
  const upperId = resume ? cursor.sweep_upper_bound_record_id! : requestedUpperId
  const afterId =
    resume && cursor.cursor_record_id && cursor.cursor_record_id > lowerId
      ? cursor.cursor_record_id
      : lowerId
  // Read only the UUIDv7 keyset page. Joining posts before LIMIT could scan and sort an
  // unbounded parent relation, and locking a version before its post reverses writer lock order.
  const { rows } =
    kind === 'superseded_versions'
      ? await query<{ id: string; version_id: string; post_id: string }>(
          `/* cleanupPostModerationLedgerPage.listVersions */
           SELECT version.id, version.id AS version_id, version.post_id
           FROM post_moderation_versions version
           WHERE version.id > $1::uuid AND version.id < $2::uuid
           ORDER BY version.id LIMIT $3`,
          [afterId, upperId, batchSize + 1],
        )
      : await query<{ id: string; version_id: string; post_id?: string }>(
          `/* cleanupPostModerationLedgerPage.listPassEvidence */
           SELECT disposition.id, disposition.version_id
           FROM post_moderation_dispositions disposition
           WHERE disposition.id > $1::uuid AND disposition.id < $2::uuid
             AND disposition.disposition = 'pass' AND disposition.source <> 'staff'
             AND disposition.evidence <> '{}'::jsonb
           ORDER BY disposition.id LIMIT $3`,
          [afterId, upperId, batchSize + 1],
        )
  const page = rows.slice(0, batchSize)
  const versionPostIds =
    kind === 'superseded_versions' || page.length === 0
      ? new Map(page.map(row => [row.version_id, row.post_id!]))
      : new Map(
          (
            await query<{ id: string; post_id: string }>(
              `/* cleanupPostModerationLedgerPage.listPageVersionOwners */
               SELECT id, post_id FROM post_moderation_versions
               WHERE id = ANY($1::uuid[])`,
              [page.map(row => row.version_id)],
            )
          ).rows.map(row => [row.id, row.post_id]),
        )
  const postIds = [...new Set(versionPostIds.values())]
  // Writers lock posts before changing their digest. Wait for this bounded, ordered page so
  // contention cannot advance the cursor past work without an immediate continuation.
  const { rows: lockedPosts } = await query<{ id: string }>(
    `/* cleanupPostModerationLedgerPage.lockPagePosts */
     SELECT id FROM posts WHERE id = ANY($1::uuid[])
     ORDER BY id FOR UPDATE`,
    [postIds],
  )
  const lockedPostIds = lockedPosts.map(row => row.id)
  const lockedPostIdSet = new Set(lockedPostIds)
  const ids = page.flatMap(row =>
    lockedPostIdSet.has(versionPostIds.get(row.version_id)!) ? [row.id] : [],
  )
  let changed = 0
  if (ids.length > 0) {
    const result =
      kind === 'superseded_versions'
        ? await query(
            `/* cleanupPostModerationLedgerPage.deleteVersions */
             DELETE FROM post_moderation_versions version
             USING posts post
             WHERE version.id = ANY($1::uuid[]) AND post.id = version.post_id
               AND post.id = ANY($4::uuid[])
               AND (version.content_sha256 <> post.llm_moderation_content_sha256
                    OR version.policy_revision <> $2)
               AND EXISTS (
                 SELECT 1 FROM post_moderation_versions successor
                 WHERE successor.post_id = version.post_id
                   AND successor.id > version.id AND successor.id < $3::uuid
               )`,
            [ids, POST_MODERATION_POLICY_REVISION, upperId, lockedPostIds],
          )
        : await query(
            `/* cleanupPostModerationLedgerPage.clearPassEvidence */
             UPDATE post_moderation_dispositions disposition SET evidence = '{}'::jsonb
             FROM post_moderation_versions version, posts post
             WHERE disposition.id = ANY($1::uuid[])
               AND version.id = disposition.version_id AND post.id = version.post_id
               AND post.id = ANY($3::uuid[])
               AND version.content_sha256 = post.llm_moderation_content_sha256
               AND version.policy_revision = $2
               AND disposition.disposition = 'pass' AND disposition.source <> 'staff'
               AND disposition.evidence <> '{}'::jsonb`,
            [ids, POST_MODERATION_POLICY_REVISION, lockedPostIds],
          )
    changed = result.rowCount ?? 0
  }
  const hasMore = rows.length > batchSize
  await query(
    `/* cleanupPostModerationLedgerPage.checkpoint */
     UPDATE post_moderation_retention_cursors
     SET cursor_record_id = $2::uuid, sweep_upper_bound_record_id = $3::uuid,
         sweep_lower_bound_record_id = $4::uuid
     WHERE kind = $1::post_moderation_retention_kinds`,
    [kind, hasMore ? page.at(-1)!.id : null, hasMore ? upperId : null, hasMore ? lowerId : null],
  )
  await query.commit()
  return { changed, hasMore }
}
