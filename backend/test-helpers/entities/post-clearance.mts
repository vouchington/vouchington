import { assertNever } from '@modules/utils/assert-never'
import { beginTransaction, write } from '@data-stores/psql'
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
  await using transaction = await beginTransaction()
  // RowExclusive on posts before history. FOR UPDATE is only RowShare and does not
  // wait for the ShareRowExclusive lock clearance-month attach takes on posts.
  await transaction(sql`
    /* insertTestPostClearanceChange:lockPost */
    UPDATE posts SET created_via = created_via WHERE id = ${options.postId}
  `)
  const { rows } = await transaction<{ id: string }>(sql`
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
  await transaction.commit()
  return rows[0]!
}

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
  await using transaction = await beginTransaction()
  // Posts before history. Clearance-month attach locks post_clearance_changes,
  // then ShareRowExclusive on posts; createPostClearancePartitions takes posts
  // first. Waiting here means this transaction does not already hold history.
  await transaction(sql`
    /* setTestPostClearanceStatus:lockPost */
    UPDATE posts
    SET clearance_version = clearance_version
    WHERE id = ${postId}
  `)
  const { rows } = await transaction<{ id: string; community_id: string | null }>(sql`
    /* setTestPostClearanceStatus */
    WITH inserted_change AS (
      INSERT INTO post_clearance_changes (id, post_id, change_type, changed_by_id)
      VALUES (COALESCE(${changeId}::uuid, uuidv7()), ${postId}, ${changeType}, ${updatedById ?? null})
      RETURNING id, post_id, change_type, created_at, changed_by_id, public_reason_code, is_platform_override
    )
    UPDATE posts
    SET
      clearance_version = posts.clearance_version + 1,
      clearance_changed_at = inserted_change.created_at,
      clearance_changed_by_id = inserted_change.changed_by_id,
      clearance_public_reason_code = inserted_change.public_reason_code,
      clearance_is_platform_override = inserted_change.is_platform_override,
      approved_at = CASE WHEN inserted_change.change_type = 'approve' THEN inserted_change.created_at ELSE NULL END,
      rejected_at = CASE WHEN inserted_change.change_type = 'reject' THEN inserted_change.created_at ELSE NULL END,
      in_review_at = CASE WHEN inserted_change.change_type = 'mark_in_review' THEN inserted_change.created_at ELSE NULL END,
      updated_by_id = COALESCE(${updatedById ?? null}, updated_by_id)
    FROM inserted_change
    WHERE posts.id = inserted_change.post_id
    RETURNING inserted_change.id, posts.community_id
  `)
  await transaction.commit()
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
