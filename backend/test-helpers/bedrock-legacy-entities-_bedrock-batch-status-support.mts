// Internal support module (leading underscore = not part of the public barrel).
// Owns fixture-only status derivation so test-helpers does not depend on the
// bedrock-embeddings-batch service package. That dependency would create a workspace cycle
// because backend services depend on test-helpers for their tests.

export type BedrockBatchStatus =
  | 'preparing'
  | 'submitted'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled'

type Lifecycle = {
  submitted_at: Date | null
  in_progress_at: Date | null
  completed_at: Date | null
  failed_at: Date | null
  cancelled_at: Date | null
}

type LifecycleColumn =
  | 'submitted_at'
  | 'in_progress_at'
  | 'completed_at'
  | 'failed_at'
  | 'cancelled_at'

export function deriveBedrockBatchStatus(row: Lifecycle): BedrockBatchStatus {
  if (row.completed_at) return 'completed'
  if (row.failed_at) return 'failed'
  if (row.cancelled_at) return 'cancelled'
  if (row.in_progress_at) return 'in_progress'
  if (row.submitted_at) return 'submitted'
  return 'preparing'
}

export function lifecycleColumnForBedrockStatus(bedrockStatus: string): LifecycleColumn | null {
  if (
    bedrockStatus === 'Submitted' ||
    bedrockStatus === 'Validating' ||
    bedrockStatus === 'Scheduled'
  )
    return 'submitted_at'
  if (bedrockStatus === 'InProgress' || bedrockStatus === 'Stopping') return 'in_progress_at'
  if (bedrockStatus === 'Completed' || bedrockStatus === 'PartiallyCompleted') return 'completed_at'
  if (bedrockStatus === 'Failed' || bedrockStatus === 'Expired') return 'failed_at'
  if (bedrockStatus === 'Stopped') return 'cancelled_at'
  return null
}
