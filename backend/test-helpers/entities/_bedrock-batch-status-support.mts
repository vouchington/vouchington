// Internal support module (leading underscore = not part of the public barrel).
// Duplicates the bedrock-embeddings-batch domain's status-derivation logic so test-helpers does
// not depend on that service package, which would otherwise create a workspace dependency cycle
// (every backend service devDeps test-helpers for its tests). This module has zero imports in
// its source of truth — it is pure lifecycle-column-derivation logic — so the duplication cannot
// drift into a data-store/service dependency.

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
