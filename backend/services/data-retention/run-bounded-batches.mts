import { DEFAULT_BATCH_SIZE, normalizePositiveInteger } from './cleanup-batches.mts'

export async function runBoundedBatches(
  limits: { batchSize?: number; maxBatches?: number },
  deleteBatch: (batchSize: number) => Promise<number>,
): Promise<{ deleted: number; hasMore: boolean }> {
  const batchSize = normalizePositiveInteger(limits.batchSize, DEFAULT_BATCH_SIZE, 'batchSize')
  const maxBatches = normalizePositiveInteger(limits.maxBatches, Infinity, 'maxBatches')
  let deleted = 0
  let hasMore = false
  for (let batches = 0; batches < maxBatches; batches += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each committed batch's row count decides whether another batch runs
    const batchDeleted = await deleteBatch(batchSize)
    deleted += batchDeleted
    hasMore = batchDeleted === batchSize
    if (!hasMore) break
  }
  return { deleted, hasMore }
}
