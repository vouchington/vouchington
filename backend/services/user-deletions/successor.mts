import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { UserDeletionPhase } from './phases.mts'
import type { UserDeletionBatchResult, UserDeletionRequest } from './types.mts'

export async function createUserDeletionSuccessor(
  request: UserDeletionRequest,
  nextPhase: UserDeletionPhase,
  delayMs: number,
  query: TransactionQuery,
): Promise<UserDeletionBatchResult> {
  const { rows } = await query(sql`/* advanceUserDeletionAttempt:successor */
    UPDATE user_deletion_requests
    SET current_phase = ${nextPhase},
        processing_attempt_id = uuidv7(),
        processing_started_at = NULL,
        dispatched_at = CURRENT_TIMESTAMP + (${delayMs}::int * INTERVAL '1 millisecond')
    WHERE id = ${request.id}
      AND processing_attempt_id = ${request.processingAttemptId}
    RETURNING processing_attempt_id
  `)
  const successor = rows[0] as { processing_attempt_id: string } | undefined
  if (!successor) return null
  return {
    requestId: request.id,
    processingAttemptId: successor.processing_attempt_id,
    ...(delayMs > 0 ? { delayMs } : {}),
  }
}
