/* oxlint-disable max-lines -- Clearance fixtures include ledger-backed completion setup. */
import { read, write } from '@data-stores/psql'
import { v7 as uuidv7 } from 'uuid'
import sql from 'sql-template-strings'
import { recordTestPostModerationDisposition } from './post-moderation.mts'

// Duplicates the post-clearance domain's setPostClearanceStatus SQL so test-helpers does not
// depend on that service package, which would otherwise create a workspace dependency cycle
// (every backend service devDeps test-helpers for its tests). Test fixtures only need the raw
// state transition, not the cache-invalidation/training-feedback/notification side effects the
// real service layers on top in update-status.mts.
export type TestClearanceStatus = 'pending' | 'approved' | 'rejected' | 'in_review'

const TEST_CLEARANCE_STATUS_TO_CHANGE_TYPE: Record<TestClearanceStatus, string> = {
  approved: 'approve',
  rejected: 'reject',
  in_review: 'mark_in_review',
  pending: 'reset_to_pending',
}

export async function insertTestPostClearanceChange(options: {
  postId: string
  status: TestClearanceStatus
  changedById?: string | null
  metadata?: Record<string, unknown>
  moderationTransparencyCategories?: string[]
  occurredAt?: Date
  occurredAtSequence?: number
}): Promise<{ id: string }> {
  const changedById = options.changedById === undefined ? null : options.changedById
  const id = options.occurredAt
    ? uuidv7({ msecs: options.occurredAt.getTime(), seq: options.occurredAtSequence ?? 0 })
    : null
  const { rows } = await write<{ id: string }>(sql`
    /* insertTestPostClearanceChange */
    INSERT INTO post_clearance_changes (id, post_id, change_type, changed_by_id, metadata, moderation_transparency_categories)
    VALUES (
      COALESCE(${id}::uuid, uuidv7()),
      ${options.postId},
      ${TEST_CLEARANCE_STATUS_TO_CHANGE_TYPE[options.status]},
      ${changedById},
      ${JSON.stringify(options.metadata ?? {})}::jsonb
      , ${options.moderationTransparencyCategories ?? []}::text[]
    )
    RETURNING id
  `)
  return rows[0]!
}

/** Mutates an audit row only for trigger-maintenance regression coverage. */
export async function updateTestPostClearanceChange(options: {
  id: string
  status: TestClearanceStatus
  metadata?: Record<string, unknown>
}): Promise<void> {
  await write(sql`/* updateTestPostClearanceChange */
    UPDATE post_clearance_changes
    SET change_type = ${TEST_CLEARANCE_STATUS_TO_CHANGE_TYPE[options.status]},
        metadata = ${JSON.stringify(options.metadata ?? {})}::jsonb
    WHERE id = ${options.id}::uuid
  `)
}

/** Deletes an audit row only for trigger-maintenance regression coverage. */
export async function deleteTestPostClearanceChange(id: string): Promise<void> {
  await write(sql`/* deleteTestPostClearanceChange */
    DELETE FROM post_clearance_changes
    WHERE id = ${id}::uuid
  `)
}

export async function setTestPostClearanceStatus(
  postId: string,
  status: TestClearanceStatus,
  updatedById?: string | null,
): Promise<{ id: string; community_id: string | null } | null> {
  const changeType = TEST_CLEARANCE_STATUS_TO_CHANGE_TYPE[status]
  const { rows } = await write<{ id: string; community_id: string | null }>(sql`
    /* setTestPostClearanceStatus */
    WITH inserted_change AS (
      INSERT INTO post_clearance_changes (post_id, change_type, changed_by_id)
      VALUES (${postId}, ${changeType}, ${updatedById ?? null})
      RETURNING id, post_id, change_type, created_at
    )
    UPDATE posts
    SET
      latest_clearance_change_id = inserted_change.id,
      approved_at = CASE WHEN inserted_change.change_type = 'approve' THEN inserted_change.created_at ELSE NULL END,
      rejected_at = CASE WHEN inserted_change.change_type = 'reject' THEN inserted_change.created_at ELSE NULL END,
      in_review_at = CASE WHEN inserted_change.change_type = 'mark_in_review' THEN inserted_change.created_at ELSE NULL END,
      updated_by_id = COALESCE(${updatedById ?? null}, updated_by_id)
    FROM inserted_change
    WHERE posts.id = inserted_change.post_id
    RETURNING inserted_change.id, posts.community_id
  `)
  return rows[0] ?? null
}

export async function approveTestPost(postId: string): Promise<void> {
  await setTestPostClearanceStatus(postId, 'approved')
}

export async function setTestPostRejectedAt(postId: string, rejectedAt: Date): Promise<void> {
  await write(sql`
    /* setTestPostRejectedAt */
    UPDATE posts
    SET approved_at = NULL,
        in_review_at = NULL,
        rejected_at = ${rejectedAt}
    WHERE id = ${postId}
  `)
}

export async function appendTestPlatformRejectionNote(postId: string, note: string): Promise<void> {
  await write(sql`/* appendTestPlatformRejectionNote */
    WITH current_change AS (
      SELECT post.id AS post_id, change.changed_by_id
      FROM posts post
      JOIN post_clearance_changes change ON change.id = post.latest_clearance_change_id
      WHERE post.id = ${postId}
    ), inserted_change AS (
      INSERT INTO post_clearance_changes (
        post_id, change_type, changed_by_id, public_reason_code, private_note,
        platform_override, metadata
      )
      SELECT post_id, 'reject', changed_by_id, 'staff_rejected', ${note}, TRUE,
        '{"test_fixture":true}'::jsonb
      FROM current_change
      WHERE changed_by_id IS NOT NULL
      RETURNING id, post_id, created_at
    )
    UPDATE posts
    SET latest_clearance_change_id = inserted_change.id,
        approved_at = NULL,
        rejected_at = inserted_change.created_at,
        in_review_at = NULL
    FROM inserted_change
    WHERE posts.id = inserted_change.post_id
  `)
}

export async function getPostClearanceStatus(postId: string): Promise<string | null> {
  const { rows } = await read(sql`
    SELECT clearance_status FROM view_post_clearance_status WHERE post_id = ${postId}
  `)
  return rows[0]?.clearance_status ?? null
}

export async function getPostClearanceChanges(
  postId: string,
): Promise<Array<{ change_type: string; changed_by_id: string | null }>> {
  const { rows } = await read<{ change_type: string; changed_by_id: string | null }>(sql`
    SELECT change_type, changed_by_id
    FROM post_clearance_changes
    WHERE post_id = ${postId}
    ORDER BY id
  `)
  return rows
}

export async function getLatestPostClearanceMetadata(
  postId: string,
): Promise<Record<string, unknown>> {
  const { rows } = await read<{ metadata: Record<string, unknown> }>(sql`
    SELECT metadata
    FROM post_clearance_changes
    WHERE post_id = ${postId}
    ORDER BY id DESC
    LIMIT 1
  `)
  return rows[0]?.metadata ?? {}
}

export async function getLatestPostClearanceDecision(postId: string): Promise<{
  id: string
  changed_by_id: string | null
  public_reason_code: string | null
  private_note: string | null
  platform_override: boolean
} | null> {
  const { rows } = await read<{
    id: string
    changed_by_id: string | null
    public_reason_code: string | null
    private_note: string | null
    platform_override: boolean
  }>(sql`
    SELECT id, changed_by_id, public_reason_code, private_note, platform_override
    FROM post_clearance_changes
    WHERE post_id = ${postId}
    ORDER BY id DESC
    LIMIT 1
  `)
  return rows[0] ?? null
}

export async function getLatestPostClearanceTransparencyCategories(
  postId: string,
): Promise<string[]> {
  const { rows } = await read<{ moderation_transparency_categories: string[] }>(sql`
    SELECT moderation_transparency_categories
    FROM post_clearance_changes
    WHERE post_id = ${postId}
    ORDER BY id DESC
    LIMIT 1
  `)
  return rows[0]?.moderation_transparency_categories ?? []
}

/** `undefined` means no clearance change row exists yet; `null` means the latest row stamped a global (non-community) cohort. */
export async function getLatestPostClearanceTransparencyCommunityId(
  postId: string,
): Promise<string | null | undefined> {
  const { rows } = await read<{ moderation_transparency_community_id: string | null }>(sql`
    /* getLatestPostClearanceTransparencyCommunityId */
    SELECT moderation_transparency_community_id
    FROM post_clearance_changes
    WHERE post_id = ${postId}
    ORDER BY id DESC
    LIMIT 1
  `)
  return rows[0]?.moderation_transparency_community_id
}

export async function setPostModerationComplete(postId: string, flagged: boolean): Promise<void> {
  await recordTestPostModerationDisposition({
    postId,
    source: 'openai_omni',
    disposition: flagged ? 'review' : 'pass',
    reasonCode: flagged ? 'provider_flagged' : 'provider_pass',
  })
}

export async function setPostSpamDetectionComplete(
  postId: string,
  flagged: boolean,
): Promise<void> {
  await recordTestPostModerationDisposition({
    postId,
    source: 'spam_detection',
    disposition: flagged ? 'review' : 'pass',
    reasonCode: flagged ? 'spam_signal' : 'provider_pass',
    evidence: { composite_score: flagged ? 1 : 0, signals: [] },
  })
}
