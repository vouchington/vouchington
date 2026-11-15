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
  let lastProcessed = after
  // The existing raw candidate-run cap also bounds this invocation-local map.
  const reportingDays = new Map<string, ReconcileEntityData>()
  async function* deferredReportingDays() {
    yield* reportingDays.values()
  }
  try {
    for await (const batch of batches) {
      for (const candidate of batch) {
        if (
          candidate.entityType === 'reporting_growth' ||
          candidate.entityType === 'reporting_workload'
        ) {
          // The cursor stream is ordered, so the last tuple is this day's latest source revision.
          reportingDays.set(`${candidate.entityType}:${candidate.entityId}`, candidate)
        } else {
          // oxlint-disable-next-line no-await-in-loop -- the checkpoint must not outrun any entity side effect
          await reconcileEntity(candidate)
        }
        lastProcessed = candidate
        if (reportingDays.size === 0) after = candidate
        reconciled += 1
      }
    }
    for await (const candidate of deferredReportingDays()) {
      await reconcileEntity(candidate)
    }
    after = lastProcessed
  } catch (err) {
    if (after || reportingDays.size > 0) await options.onMore(after)
    throw err
  }
  const hasMore = options.hasMore()
  if (hasMore) await options.onMore(after)
  return { reconciled, hasMore }
}
