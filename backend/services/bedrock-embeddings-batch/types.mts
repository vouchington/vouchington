import type { getBatchCreationLimits } from './rate-limits.mts'
import type { createBatch } from './orchestrator/create.mts'

export type CreateBatchResult = { hasMore: boolean } & (
  | { success: true }
  | { reEnqueued: true; reason: string }
  | { failed: true; reason: string; attempted: number }
  | { empty: true }
)

export type BatchCreationDependencies = {
  getBatchCreationLimits: typeof getBatchCreationLimits
  createBatch: typeof createBatch
}
