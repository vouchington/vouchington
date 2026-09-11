import { isUserDeletionPhase } from './phases.mts'
import type { UserDeletionRequest } from './types.mts'

export type UserDeletionRequestRow = {
  id: string
  user_id: string
  requested_by_id: string | null
  processing_attempt_id: string
  current_phase: string
  processing_started_at: Date | null
  processing_attempts: number
  completed_at: Date | null
}

export function mapUserDeletionRequest(row: UserDeletionRequestRow): UserDeletionRequest {
  if (!isUserDeletionPhase(row.current_phase)) {
    throw new Error(`Unknown user deletion phase: ${row.current_phase}`)
  }
  return {
    id: row.id,
    userId: row.user_id,
    requestedById: row.requested_by_id,
    processingAttemptId: row.processing_attempt_id,
    currentPhase: row.current_phase,
    processingStartedAt: row.processing_started_at,
    processingAttempts: row.processing_attempts,
    completedAt: row.completed_at,
  }
}
