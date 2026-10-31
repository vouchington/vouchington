import { assertNever } from '@modules/utils/assert-never'
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

function clearanceChangeType(status: TestClearanceStatus): string {
  switch (status) {
    case 'approved':
      return 'approve'
    case 'rejected':
      return 'reject'
    case 'in_review':
      return 'mark_in_review'
    case 'pending':
      return 'reset_to_pending'
    default:
      return assertNever(status, 'Unknown clearance status')
  }
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
      ${clearanceChangeType(options.status)},
      ${changedById},
      ${JSON.stringify(options.metadata ?? {})}::jsonb
      , ${options.moderationTransparencyCategories ?? []}::moderation_transparency_categories[]
    )
    RETURNING id
  `)
  return rows[0]!
}

export async function readTestPostClearanceAuthor(changeId: string): Promise<string | null> {
  const { rows } = await read<{ post_author_user_id: string | null }>(sql`
    /* readTestPostClearanceAuthor */
    SELECT post_author_user_id FROM post_clearance_changes WHERE id = ${changeId}::uuid
  `)
  if (!rows[0]) throw new Error('Expected a post clearance change')
  return rows[0].post_author_user_id
}

/** Mutates an audit row only for trigger-maintenance regression coverage. */
export async function updateTestPostClearanceChange(options: {
  id: string
  status: TestClearanceStatus
  metadata?: Record<string, unknown>
}): Promise<void> {
  await write(sql`/* updateTestPostClearanceChange */
    UPDATE post_clearance_changes
    SET change_type = ${clearanceChangeType(options.status)},
        metadata = ${JSON.stringify(options.metadata ?? {})}::jsonb
    WHERE id = ${options.id}::uuid
  `)
}

export async function setTestPostClearanceStatus(
  postId: string,
  status: TestClearanceStatus,
  updatedById?: string | null,
  occurredAt?: Date,
  sequence = 0,
): Promise<{ id: string; community_id: string | null } | null> {
  const changeType = clearanceChangeType(status)
  const changeId = occurredAt ? uuidv7({ msecs: occurredAt.getTime(), seq: sequence }) : null
  // History commits before the post update. One transaction holds RowExclusive on
  // post_clearance_changes and then waits for RowExclusive on posts, while the other
  // session holds ShareRowExclusive on posts and waits for ShareRowExclusive on
  // post_clearance_changes. The reverse order deadlocks too. The insert takes only
  // AccessShare and RowShare on posts, which ShareRowExclusive allows.
  const { rows: insertedRows } = await write<{
    id: string
    change_type: string
    created_at: Date
    changed_by_id: string | null
    public_reason_code: string | null
    is_platform_override: boolean
  }>(sql`
    /* setTestPostClearanceStatus */
    INSERT INTO post_clearance_changes (id, post_id, change_type, changed_by_id)
    SELECT COALESCE(${changeId}::uuid, uuidv7()), post.id, ${changeType}, ${updatedById ?? null}
    FROM posts post
    WHERE post.id = ${postId}
    RETURNING id, change_type, created_at, changed_by_id, public_reason_code, is_platform_override
  `)
  const inserted = insertedRows[0]
  if (!inserted) return null
  const { rows } = await write<{ community_id: string | null }>(sql`
    /* setTestPostClearanceStatus:projectPost */
    UPDATE posts
    SET
      clearance_version = posts.clearance_version + 1,
      clearance_changed_at = ${inserted.created_at}::timestamptz,
      clearance_changed_by_id = ${inserted.changed_by_id}::uuid,
      clearance_public_reason_code = ${inserted.public_reason_code},
      clearance_is_platform_override = ${inserted.is_platform_override}::boolean,
      approved_at = CASE WHEN ${inserted.change_type} = 'approve' THEN ${inserted.created_at}::timestamptz ELSE NULL END,
      rejected_at = CASE WHEN ${inserted.change_type} = 'reject' THEN ${inserted.created_at}::timestamptz ELSE NULL END,
      in_review_at = CASE WHEN ${inserted.change_type} = 'mark_in_review' THEN ${inserted.created_at}::timestamptz ELSE NULL END,
      updated_by_id = COALESCE(${updatedById ?? null}, updated_by_id)
    WHERE id = ${postId}
    RETURNING community_id
  `)
  const projected = rows[0]
  if (!projected) return null
  return { id: inserted.id, community_id: projected.community_id }
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

export async function appendTestPlatformRejectionNote(
  postId: string,
  note: string,
  occurredAt?: Date,
  sequence = 0,
): Promise<string> {
  const changeId = occurredAt ? uuidv7({ msecs: occurredAt.getTime(), seq: sequence }) : null
  const { rows } = await write<{ id: string }>(sql`/* appendTestPlatformRejectionNote */
    WITH current_change AS (
      SELECT post.id AS post_id, post.clearance_changed_by_id AS changed_by_id,
        post.clearance_version + 1 AS next_clearance_version
      FROM posts post
      WHERE post.id = ${postId}
    ), inserted_change AS (
      INSERT INTO post_clearance_changes (
        id, post_id, change_type, changed_by_id, public_reason_code, private_note,
        is_platform_override, platform_override_clearance_version, metadata
      )
      SELECT COALESCE(${changeId}::uuid, uuidv7()), post_id, 'reject', changed_by_id,
        'staff_rejected', ${note}, TRUE, next_clearance_version,
        '{"test_fixture":true}'::jsonb
      FROM current_change
      WHERE changed_by_id IS NOT NULL
      RETURNING id, post_id, created_at, changed_by_id, public_reason_code, is_platform_override
    )
    UPDATE posts
    SET clearance_version = posts.clearance_version + 1,
      clearance_changed_at = inserted_change.created_at,
      clearance_changed_by_id = inserted_change.changed_by_id,
      clearance_public_reason_code = inserted_change.public_reason_code,
      clearance_is_platform_override = inserted_change.is_platform_override,
      approved_at = NULL,
        rejected_at = inserted_change.created_at,
        in_review_at = NULL
    FROM inserted_change
    WHERE posts.id = inserted_change.post_id
    RETURNING inserted_change.id
  `)
  if (!rows[0]) throw new Error('Expected a platform rejection change')
  return rows[0].id
}

export async function getPostClearanceStatus(postId: string): Promise<string | null> {
  const { rows } = await read(
    sql`/* getPostClearanceStatus */
    SELECT clearance_status FROM view_post_clearance_status WHERE post_id = ${postId}
  `,
  )
  return rows[0]?.clearance_status ?? null
}

export async function getPostClearanceChanges(
  postId: string,
): Promise<Array<{ change_type: string; changed_by_id: string | null }>> {
  const { rows } = await read<{ change_type: string; changed_by_id: string | null }>(
    sql`/* getPostClearanceChanges */
    SELECT change_type, changed_by_id
    FROM post_clearance_changes
    WHERE post_id = ${postId}
    ORDER BY id
  `,
  )
  return rows
}

export async function getLatestPostClearanceMetadata(
  postId: string,
): Promise<Record<string, unknown>> {
  const { rows } = await read<{ metadata: Record<string, unknown> }>(
    sql`/* getLatestPostClearanceMetadata */
    SELECT metadata
    FROM post_clearance_changes
    WHERE post_id = ${postId}
    ORDER BY id DESC
    LIMIT 1
  `,
  )
  return rows[0]?.metadata ?? {}
}

export async function getLatestPostClearanceDecision(postId: string): Promise<{
  id: string
  changed_by_id: string | null
  public_reason_code: string | null
  private_note: string | null
  is_platform_override: boolean
} | null> {
  const { rows } = await read<{
    id: string
    changed_by_id: string | null
    public_reason_code: string | null
    private_note: string | null
    is_platform_override: boolean
  }>(
    sql`/* getLatestPostClearanceDecision */
    SELECT id, changed_by_id, public_reason_code, private_note, is_platform_override
    FROM post_clearance_changes
    WHERE post_id = ${postId}
    ORDER BY id DESC
    LIMIT 1
  `,
  )
  return rows[0] ?? null
}

export async function getLatestPostClearanceTransparencyCategories(
  postId: string,
): Promise<string[]> {
  const { rows } = await read<{ moderation_transparency_categories: string[] }>(
    sql`/* getLatestPostClearanceTransparencyCategories */
    SELECT moderation_transparency_categories::text[] AS moderation_transparency_categories
    FROM post_clearance_changes
    WHERE post_id = ${postId}
    ORDER BY id DESC
    LIMIT 1
  `,
  )
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

export async function getTestCurrentPostClearance(postId: string): Promise<{
  clearance_version: string
  clearance_changed_at: Date | null
  clearance_changed_by_id: string | null
  clearance_public_reason_code: string | null
  clearance_is_platform_override: boolean
  has_creation_moderation_bypass: boolean
  clearance_status: string
  clearance_reason: string | null
} | null> {
  const { rows } = await read<{
    clearance_version: string
    clearance_changed_at: Date | null
    clearance_changed_by_id: string | null
    clearance_public_reason_code: string | null
    clearance_is_platform_override: boolean
    has_creation_moderation_bypass: boolean
    clearance_status: string
    clearance_reason: string | null
  }>(sql`/* getTestCurrentPostClearance */
    SELECT post.clearance_version, post.clearance_changed_at,
      post.clearance_changed_by_id, post.clearance_public_reason_code,
      post.clearance_is_platform_override, post.has_creation_moderation_bypass,
      status.clearance_status, status.clearance_reason
    FROM posts post
    JOIN view_post_clearance_status status ON status.post_id = post.id
    WHERE post.id = ${postId}
  `)
  return rows[0] ?? null
}
