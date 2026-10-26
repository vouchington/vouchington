import type { ReconcileEntityData } from '@queues/entity-listeners/types'

export async function reconcileEntityBatches(
  batches: AsyncIterable<ReconcileEntityData[]>,
  reconcileEntity: (data: ReconcileEntityData) => Promise<void>,
  options: {
    hasMore: () => boolean
    initialAfter?: ReconcileEntityData
    onMore: (after?: ReconcileEntityData) => Promise<unknown>
  },
): Promise<{ reconciled: number; hasMore: boolean }> {
  let reconciled = 0
  let after = options.initialAfter
  try {
    for await (const batch of batches) {
      for (const candidate of batch) {
        // oxlint-disable-next-line no-await-in-loop -- the checkpoint must not outrun any entity side effect
        await reconcileEntity(candidate)
        after = candidate
        reconciled += 1
      }
    }
  } catch (err) {
    if (after) await options.onMore(after)
    throw err
  }
  const hasMore = options.hasMore()
  if (hasMore) await options.onMore(after)
  return { reconciled, hasMore }
}
