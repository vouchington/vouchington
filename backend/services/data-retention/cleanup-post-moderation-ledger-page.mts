import { beginTransaction } from '@data-stores/psql'
import type { PostModerationRetentionKind } from '@voucha/types/entities/moderation-retention'
import {
  processPostModerationCandidatePage,
  type PostModerationCandidate,
} from './cleanup-post-moderation-ledger-candidates.mts'
import { reconsiderChangedPostModerationPost } from './cleanup-post-moderation-ledger-hash-work.mts'
import { reconsiderPostModerationPolicyRevision } from './cleanup-post-moderation-ledger-policy.mts'

const ZERO_UUID = '00000000-0000-0000-0000-000000000000'

export async function cleanupPostModerationLedgerPage(
  kind: PostModerationRetentionKind,
  batchSize: number,
  requestedUpperId: string,
  lowerId: string,
): Promise<{ changed: number; hasMore: boolean }> {
  // Each phase commits before the next phase acquires a different post's lock.
  // This keeps every writer and worker on post→work→source or work→source order.
  const dirty = await runPostModerationHashWorkPage(batchSize)
  const candidate = await runPostModerationDuePage(
    kind,
    batchSize,
    requestedUpperId,
    lowerId,
    dirty.processed,
  )
  const policy =
    kind === 'superseded_versions'
      ? await runPostModerationPolicyPage(batchSize)
      : { processed: false, hasMore: false }
  return {
    changed: candidate.changed,
    hasMore: candidate.hasMore || dirty.hasMore || policy.hasMore || policy.processed,
  }
}

async function runPostModerationHashWorkPage(batchSize: number) {
  await using query = await beginTransaction()
  const result = await reconsiderChangedPostModerationPost(query, batchSize)
  await query.commit()
  return result
}

async function runPostModerationPolicyPage(batchSize: number) {
  await using query = await beginTransaction()
  const result = await reconsiderPostModerationPolicyRevision(query, batchSize)
  await query.commit()
  return result
}

async function runPostModerationDuePage(
  kind: PostModerationRetentionKind,
  batchSize: number,
  requestedUpperId: string,
  lowerId: string,
  dirtyProcessed: boolean,
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
    cursor_due_at: Date | null
    cursor_lower_bound_record_id: string | null
    sweep_upper_bound_record_id: string | null
  }>(
    `/* cleanupPostModerationLedgerPage.lockCursor */
     SELECT cursor_record_id, cursor_due_at, cursor_lower_bound_record_id,
       sweep_upper_bound_record_id
     FROM post_moderation_retention_cursors
     WHERE kind = $1::post_moderation_retention_kinds FOR UPDATE`,
    [kind],
  )
  const cursor = cursors[0]
  if (!cursor) throw new Error(`Missing post moderation retention cursor: ${kind}`)
  const resume =
    cursor.cursor_lower_bound_record_id !== null &&
    cursor.cursor_lower_bound_record_id <= lowerId &&
    cursor.sweep_upper_bound_record_id !== null &&
    cursor.sweep_upper_bound_record_id > lowerId &&
    cursor.sweep_upper_bound_record_id <= requestedUpperId &&
    cursor.cursor_due_at !== null &&
    cursor.cursor_record_id !== null &&
    !dirtyProcessed
  const upperId = resume ? cursor.sweep_upper_bound_record_id! : requestedUpperId
  const afterDueAt = resume ? cursor.cursor_due_at! : '-infinity'
  const afterId = resume ? cursor.cursor_record_id! : ZERO_UUID
  const { rows } =
    kind === 'superseded_versions'
      ? await query<PostModerationCandidate>(
          `/* cleanupPostModerationLedgerPage.listVersions */
           SELECT id, id AS version_id, retention_due_at
           FROM post_moderation_versions
           WHERE retention_due_at IS NOT NULL
             AND retention_due_at < uuid_extract_timestamp($1::uuid)
             AND id > $2::uuid AND id < $1::uuid
             AND (retention_due_at, id) > ($3::timestamptz, $4::uuid)
           ORDER BY retention_due_at, id LIMIT $5`,
          [upperId, lowerId, afterDueAt, afterId, batchSize + 1],
        )
      : await query<PostModerationCandidate>(
          `/* cleanupPostModerationLedgerPage.listPassEvidence */
           SELECT id, version_id, retention_due_at
           FROM post_moderation_dispositions
           WHERE retention_due_at IS NOT NULL
             AND retention_due_at < uuid_extract_timestamp($1::uuid)
             AND id > $2::uuid AND id < $1::uuid
             AND (retention_due_at, id) > ($3::timestamptz, $4::uuid)
             AND disposition = 'pass' AND source <> 'staff' AND evidence <> '{}'::jsonb
           ORDER BY retention_due_at, id LIMIT $5`,
          [upperId, lowerId, afterDueAt, afterId, batchSize + 1],
        )
  const page = rows.slice(0, batchSize)
  const outcome = await processPostModerationCandidatePage(query, kind, page, upperId)
  const { rows: pendingWork } = await query<{ post_id: string }>(
    `/* hasPostModerationRetentionPostWork */
     SELECT post_id FROM post_moderation_retention_post_work_items LIMIT 1`,
  )
  const hasMore = rows.length > batchSize || outcome.needsRetry || pendingWork.length > 0
  // A queued recheck can rearm a due row behind this position, including if another
  // worker consumes that item before our next call. Restart after those signals.
  const checkpoint = hasMore && page.length > 0 && !outcome.needsRetry && pendingWork.length === 0
  await query(
    `/* cleanupPostModerationLedgerPage.checkpoint */
     UPDATE post_moderation_retention_cursors
     SET cursor_record_id = $2::uuid, cursor_due_at = $3::timestamptz,
         sweep_upper_bound_record_id = $4::uuid,
         cursor_lower_bound_record_id = $5::uuid
     WHERE kind = $1::post_moderation_retention_kinds`,
    [
      kind,
      checkpoint ? page.at(-1)!.id : null,
      checkpoint ? page.at(-1)!.retention_due_at : null,
      hasMore ? upperId : null,
      hasMore ? lowerId : null,
    ],
  )
  await query.commit()
  return { changed: outcome.changed, hasMore }
}
