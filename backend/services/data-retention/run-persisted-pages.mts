import { DEFAULT_BATCH_SIZE } from './cleanup-batches.mts'
import { getAIRetentionPageLimits, type DataRetentionLimits } from './config.mts'
import { assertPositiveInteger, normalizePositiveInteger } from './normalize-positive-integer.mts'

export type PersistedPage<Position> = {
  deleted: number
  hasMore: boolean
  continuation: Position | null
}

/** Committed deletion makes progress itself; guarded sweeps persist positions across kept rows. */
export async function runPersistedRetentionPages<Position>(
  limits: { batchSize?: number; maxBatches: number },
  deletePage: (batchSize: number) => Promise<PersistedPage<Position>>,
  ceiling: DataRetentionLimits = getAIRetentionPageLimits(),
): Promise<PersistedPage<Position>> {
  const batchSize = Math.min(
    normalizePositiveInteger(limits.batchSize, DEFAULT_BATCH_SIZE, 'batchSize'),
    ceiling.batchSize,
  )
  const maxBatches = Math.min(
    assertPositiveInteger(limits.maxBatches, 'maxBatches'),
    ceiling.maxBatches,
  )
  let result: PersistedPage<Position> = { deleted: 0, hasMore: false, continuation: null }
  // oxlint-disable no-await-in-loop -- each committed cursor page determines the next page
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const page = await deletePage(batchSize)
    result = {
      deleted: result.deleted + page.deleted,
      hasMore: page.hasMore,
      continuation: page.continuation,
    }
    if (!page.hasMore) break
  }
  // oxlint-enable no-await-in-loop
  return result
}
