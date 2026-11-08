import { DEFAULT_BATCH_SIZE } from './cleanup-batches.mts'
import { normalizePositiveInteger } from './normalize-positive-integer.mts'
import { runBoundedPages } from '@modules/utils/run-bounded-pages'

export async function runBoundedBatches(
  limits: { batchSize?: number; maxBatches: number },
  deleteBatch: (batchSize: number) => Promise<number>,
): Promise<{ deleted: number; hasMore: boolean }> {
  const batchSize = normalizePositiveInteger(limits.batchSize, DEFAULT_BATCH_SIZE, 'batchSize')
  const { processed, hasMore } = await runBoundedPages(
    { batchSize, maxBatches: limits.maxBatches },
    deleteBatch,
  )
  return { deleted: processed, hasMore }
}
