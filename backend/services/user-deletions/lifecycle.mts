import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { USER_DELETION_BATCH_SIZE } from './phases.mts'
import { mapUserDeletionRequest, type UserDeletionRequestRow } from './row.mts'
import type {
  UserDeletionAttempt,
  UserDeletionBatchResult,
  UserDeletionDependencies,
  UserDeletionRequest,
} from './types.mts'
import { userDeletionErrorMessage } from './error-message.mts'
import { advanceUserDeletionAttempt } from './advance-attempt.mts'

export async function claimUserDeletionAttempt(
  requestId: string,
  processingAttemptId: string,
): Promise<UserDeletionRequest | null> {
  const { rows } = await write(sql`/* claimUserDeletionAttempt */
    UPDATE user_deletion_requests
    SET processing_started_at = CURRENT_TIMESTAMP,
        processing_attempts = processing_attempts + 1,
        last_error_message = NULL
    WHERE id = ${requestId}
      AND processing_attempt_id = ${processingAttemptId}
      AND processing_started_at IS NULL
      AND completed_at IS NULL
    RETURNING id, user_id, requested_by_id, processing_attempt_id, current_phase,
      processing_started_at, processing_attempts, completed_at
  `)
  const row = rows[0] as UserDeletionRequestRow | undefined
  return row ? mapUserDeletionRequest(row) : null
}

export async function renewUserDeletionAttempt(
  requestId: string,
  processingAttemptId: string,
): Promise<boolean> {
  const { rowCount } = await write(sql`/* renewUserDeletionAttempt */
    UPDATE user_deletion_requests
    SET processing_started_at = CURRENT_TIMESTAMP
    WHERE id = ${requestId}
      AND processing_attempt_id = ${processingAttemptId}
      AND processing_started_at IS NOT NULL
      AND completed_at IS NULL
  `)
  return (rowCount ?? 0) > 0
}

export async function claimRecoverableUserDeletions(): Promise<UserDeletionAttempt[]> {
  const { rows } = await write(sql`/* claimRecoverableUserDeletions */
    WITH candidates AS (
      SELECT request.id
      FROM user_deletion_requests request
      WHERE request.completed_at IS NULL
        AND (
          (request.processing_started_at IS NULL AND request.dispatched_at < NOW() - INTERVAL '5 minutes')
          OR request.processing_started_at < NOW() - INTERVAL '30 minutes'
        )
      ORDER BY request.id
      LIMIT 500
      FOR UPDATE SKIP LOCKED
    )
    UPDATE user_deletion_requests request
    SET processing_attempt_id = CASE
          WHEN request.processing_started_at < NOW() - INTERVAL '30 minutes' THEN uuidv7()
          ELSE request.processing_attempt_id
        END,
        dispatched_at = CURRENT_TIMESTAMP,
        processing_started_at = NULL,
        last_error_message = NULL
    FROM candidates
    WHERE request.id = candidates.id
    RETURNING request.id, request.processing_attempt_id
  `)
  return rows.map(row => {
    const typed = row as { id: string; processing_attempt_id: string }
    return {
      requestId: typed.id,
      processingAttemptId: typed.processing_attempt_id,
    }
  })
}

export async function processUserDeletionBatch(
  requestId: string,
  processingAttemptId: string,
  deps: UserDeletionDependencies = {},
  options: { isFinalAttempt?: boolean } = {},
): Promise<UserDeletionBatchResult> {
  const request = await claimUserDeletionAttempt(requestId, processingAttemptId)
  if (!request) return null
  try {
    const result = await processCurrentPhaseBatch(request, deps)
    return await advanceUserDeletionAttempt(request, result.hasMore, result.retryAfterMs)
  } catch (error) {
    await releaseFailedUserDeletionAttempt(
      request.id,
      request.processingAttemptId,
      error,
      options.isFinalAttempt ?? false,
    )
    throw error
  }
}

async function processCurrentPhaseBatch(
  request: UserDeletionRequest,
  deps: UserDeletionDependencies,
): Promise<{ hasMore: boolean; retryAfterMs?: number }> {
  if (!deps.processPhaseBatch) {
    throw new Error(`No processor registered for user deletion phase ${request.currentPhase}`)
  }
  const result = await deps.processPhaseBatch({
    requestId: request.id,
    userId: request.userId,
    processingAttemptId: request.processingAttemptId,
    phase: request.currentPhase,
    batchSize: USER_DELETION_BATCH_SIZE,
  })
  return result
}

async function releaseFailedUserDeletionAttempt(
  requestId: string,
  processingAttemptId: string,
  error: unknown,
  isFinalAttempt: boolean,
): Promise<void> {
  await write(sql`/* releaseFailedUserDeletionAttempt */
    UPDATE user_deletion_requests
    SET processing_attempt_id = CASE WHEN ${isFinalAttempt} THEN uuidv7() ELSE processing_attempt_id END,
        processing_started_at = NULL,
        last_error_message = ${userDeletionErrorMessage(error)}
    WHERE id = ${requestId}
      AND processing_attempt_id = ${processingAttemptId}
      AND completed_at IS NULL
  `)
}
