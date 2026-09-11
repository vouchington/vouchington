import type { UserDeletionPhase } from './phases.mts'

export type UserDeletionExternalWorkKind =
  | 'cloudflare-cache-tag'
  | 'entity-relation-effects'
  | 's3-export'
  | 'stripe-customer'

export type UserDeletionRequest = {
  id: string
  userId: string
  requestedById: string | null
  processingAttemptId: string
  currentPhase: UserDeletionPhase
  processingStartedAt: Date | null
  processingAttempts: number
  completedAt: Date | null
}

export type UserDeletionAttempt = {
  requestId: string
  processingAttemptId: string
  delayMs?: number
}

export type UserDeletionBatchResult = UserDeletionAttempt | null

export type UserDeletionPhaseProcessor = (input: {
  requestId: string
  userId: string
  processingAttemptId: string
  phase: UserDeletionPhase
  batchSize: number
}) => Promise<{ hasMore: boolean; retryAfterMs?: number }>

export type UserDeletionDependencies = {
  processPhaseBatch?: UserDeletionPhaseProcessor
}
