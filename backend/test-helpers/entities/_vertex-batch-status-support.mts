// Internal support module (leading underscore = not part of the public barrel).
// Owns fixture-only status derivation so test-helpers does not depend on the
// gemini-embeddings-batch service package. That dependency would create a workspace cycle
// because backend services depend on test-helpers for their tests.

export type VertexBatchStatus =
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

export function deriveVertexBatchStatus(row: Lifecycle): VertexBatchStatus {
  if (row.completed_at) return 'completed'
  if (row.failed_at) return 'failed'
  if (row.cancelled_at) return 'cancelled'
  if (row.in_progress_at) return 'in_progress'
  if (row.submitted_at) return 'submitted'
  return 'preparing'
}

export function lifecycleColumnForVertexState(vertexState: string): LifecycleColumn | null {
  if (vertexState === 'JOB_STATE_PENDING' || vertexState === 'JOB_STATE_QUEUED')
    return 'submitted_at'
  if (vertexState === 'JOB_STATE_RUNNING' || vertexState === 'JOB_STATE_CANCELLING')
    return 'in_progress_at'
  if (vertexState === 'JOB_STATE_SUCCEEDED' || vertexState === 'JOB_STATE_PARTIALLY_SUCCEEDED')
    return 'completed_at'
  if (vertexState === 'JOB_STATE_FAILED' || vertexState === 'JOB_STATE_EXPIRED') return 'failed_at'
  if (vertexState === 'JOB_STATE_CANCELLED') return 'cancelled_at'
  return null
}
