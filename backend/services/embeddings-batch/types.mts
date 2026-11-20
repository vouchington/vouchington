import type { getBatchCreationLimits } from './rate-limits.mts'
import type { createBatch } from './orchestrator/create.mts'

export type CreateBatchResult = { hasMore: boolean } & (
  | { success: true }
  | { reEnqueued: true; reason: string }
  | { failed: true; reason: string; attempted: number }
  | { empty: true }
)

/**
 * Production always takes the defaults. The seam stays because `createBatch` uploads to GCS and
 * submits a Vertex batch prediction job, and `getBatchCreationLimits` sums in-flight and hourly batch
 * rows across the whole shared table, so a test cannot make either deterministic on a dirty database.
 */
export type BatchCreationDependencies = {
  getBatchCreationLimits: typeof getBatchCreationLimits
  createBatch: typeof createBatch
}
