import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  getNextUserDeletionPhase,
  USER_DELETION_BATCH_SIZE,
  type UserDeletionPhase,
} from './phases.mts'
import { createUserDeletionSuccessor } from './successor.mts'
import type { UserDeletionBatchResult, UserDeletionRequest } from './types.mts'

export async function advanceUserDeletionAttempt(
  request: UserDeletionRequest,
  hasMore: boolean,
  delayMs = 0,
): Promise<UserDeletionBatchResult> {
  await using query = await beginTransaction()
  const { rows } = await query(sql`/* advanceUserDeletionAttempt:lock */
      SELECT current_phase
      FROM user_deletion_requests
      WHERE id = ${request.id}
        AND processing_attempt_id = ${request.processingAttemptId}
        AND processing_started_at IS NOT NULL
        AND completed_at IS NULL
      FOR UPDATE
    `)
  if (rows.length === 0) return null

  const phase = rows[0] as { current_phase: UserDeletionPhase }
  if (phase.current_phase !== request.currentPhase) return null
  const nextPhase = hasMore ? phase.current_phase : getNextUserDeletionPhase(phase.current_phase)
  const result = !nextPhase
    ? await finalizeUserDeletionAttempt(request, query)
    : await createUserDeletionSuccessor(request, nextPhase, delayMs, query)
  await query.commit()
  return result
}

async function finalizeUserDeletionAttempt(
  request: UserDeletionRequest,
  query: TransactionQuery,
): Promise<UserDeletionBatchResult> {
  await lockUserAndAuthor(request.userId, query)
  if (!(await canCompleteUserDeletion(request, query))) return retryFinalization(request, query)
  if (await purgeCompletedUserDeletionAuditPage(request, query)) {
    return retryFinalization(request, query)
  }
  if (await completeUserDeletion(request, query)) return null
  return retryFinalization(request, query)
}

async function lockUserAndAuthor(userId: string, query: TransactionQuery) {
  await query(sql`/* advanceUserDeletionAttempt:lockUser */
    SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))
  `)
  await query(sql`/* advanceUserDeletionAttempt:lockAuthor */
    SELECT pg_advisory_xact_lock(hashtextextended(${`author:${userId}`}, 0))
  `)
}

async function completeUserDeletion(
  request: UserDeletionRequest,
  query: TransactionQuery,
): Promise<boolean> {
  const completion = await query(sql`/* advanceUserDeletionAttempt:complete */
    UPDATE user_deletion_requests
    SET completed_at = CURRENT_TIMESTAMP,
        processing_started_at = NULL,
        prior_username = NULL
    WHERE id = ${request.id}
      AND processing_attempt_id = ${request.processingAttemptId}
      AND NOT EXISTS (
        SELECT 1 FROM user_deletion_external_works
        WHERE request_id = ${request.id} AND completed_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM user_deletion_relation_impacts
        WHERE request_id = ${request.id} AND recomputed_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM user_deletion_external_works
        WHERE request_id = ${request.id}
          AND completed_at IS NOT NULL
          AND work_key <> ('redacted:' || id::text)
      )
      AND NOT EXISTS (
        SELECT 1 FROM user_deletion_relation_impacts
        WHERE request_id = ${request.id} AND recomputed_at IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM user_data_request_attempts attempt
        JOIN user_data_requests export ON export.id = attempt.request_id
        WHERE export.user_id = ${request.userId}
      )
      AND NOT fn_user_deletion_has_remaining_owned_data(${request.userId})
    RETURNING id
  `)
  if ((completion.rowCount ?? 0) === 0) return false

  return true
}

async function canCompleteUserDeletion(
  request: UserDeletionRequest,
  query: TransactionQuery,
): Promise<boolean> {
  const receipts = await query(sql`/* advanceUserDeletionAttempt:purgeLateBlueskyFollowReceipts */
    DELETE FROM bluesky_follow_records WHERE (follower_user_id, followee_user_id) IN (
      SELECT follower_user_id, followee_user_id FROM bluesky_follow_records
      WHERE follower_user_id = ${request.userId} OR followee_user_id = ${request.userId}
      ORDER BY follower_user_id, followee_user_id LIMIT ${USER_DELETION_BATCH_SIZE}
    )
  `)
  if ((receipts.rowCount ?? 0) > 0) return false

  const { rows } = await query(sql`/* advanceUserDeletionAttempt:canComplete */
    SELECT NOT EXISTS (
      SELECT 1 FROM user_deletion_external_works
      WHERE request_id = ${request.id} AND completed_at IS NULL
    )
      AND NOT EXISTS (
        SELECT 1 FROM user_deletion_relation_impacts
        WHERE request_id = ${request.id} AND recomputed_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM user_data_request_attempts attempt
        JOIN user_data_requests export ON export.id = attempt.request_id
        WHERE export.user_id = ${request.userId}
      )
      AND NOT fn_user_deletion_has_remaining_owned_data(${request.userId}) AS can_complete
  `)
  return (rows[0] as { can_complete: boolean } | undefined)?.can_complete === true
}

async function purgeCompletedUserDeletionAuditPage(
  request: UserDeletionRequest,
  query: TransactionQuery,
): Promise<boolean> {
  const redacted = await query(sql`/* advanceUserDeletionAttempt:redactExternalWorkKeys */
    UPDATE user_deletion_external_works
    SET work_key = 'redacted:' || id::text
    WHERE id IN (
      SELECT id FROM user_deletion_external_works
      WHERE request_id = ${request.id}
        AND completed_at IS NOT NULL
        AND work_key <> ('redacted:' || id::text)
      ORDER BY id
      LIMIT ${USER_DELETION_BATCH_SIZE}
    )
  `)
  if ((redacted.rowCount ?? 0) > 0) return true

  const impacts = await query(sql`/* advanceUserDeletionAttempt:purgeRelationImpacts */
    DELETE FROM user_deletion_relation_impacts
    WHERE id IN (
      SELECT id FROM user_deletion_relation_impacts
      WHERE request_id = ${request.id} AND recomputed_at IS NOT NULL
      ORDER BY id
      LIMIT ${USER_DELETION_BATCH_SIZE}
    )
  `)
  return (impacts.rowCount ?? 0) > 0
}

async function retryFinalization(
  request: UserDeletionRequest,
  query: TransactionQuery,
): Promise<UserDeletionBatchResult> {
  const { rows } = await query(sql`/* advanceUserDeletionAttempt:retryFinalize */
    UPDATE user_deletion_requests
    SET processing_attempt_id = uuidv7(),
        processing_started_at = NULL,
        dispatched_at = CURRENT_TIMESTAMP
    WHERE id = ${request.id}
      AND processing_attempt_id = ${request.processingAttemptId}
      AND completed_at IS NULL
    RETURNING processing_attempt_id
  `)
  return mapSuccessor(request.id, rows[0] as { processing_attempt_id: string } | undefined)
}

function mapSuccessor(
  requestId: string,
  successor: { processing_attempt_id: string } | undefined,
): UserDeletionBatchResult {
  return successor ? { requestId, processingAttemptId: successor.processing_attempt_id } : null
}
