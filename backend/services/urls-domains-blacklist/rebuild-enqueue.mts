import { enqueueRebuildBloomFilter } from '@queues/bloom-filters/enqueues'
import type { RebuildBloomFilterData } from '@queues/bloom-filters/types'
import onError from '@modules/on-error'

const enqueueRebuildBloomFilterUnknown: (data: RebuildBloomFilterData) => unknown =
  enqueueRebuildBloomFilter
const pendingBestEffortRebuildEnqueues = new Set<Promise<unknown>>()
type EnqueueRebuildBloomFilter = (data: RebuildBloomFilterData) => unknown

export function enqueueRebuildBloomFilterBestEffort(
  filter: RebuildBloomFilterData['filter'],
  onEnqueued?: () => Promise<unknown>,
): void {
  enqueueRebuildBloomFilterBestEffortWithEnqueue(
    enqueueRebuildBloomFilterUnknown,
    filter,
    onEnqueued,
  )
}

export function enqueueRebuildBloomFilterBestEffortWithEnqueue(
  enqueue: EnqueueRebuildBloomFilter,
  filter: RebuildBloomFilterData['filter'],
  onEnqueued?: () => Promise<unknown>,
): void {
  let result: unknown
  try {
    result = enqueue({ filter })
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
    return
  }

  if (!isPromiseLike(result)) {
    let settled: Promise<unknown>
    try {
      settled = onEnqueued ? Promise.resolve(onEnqueued()) : Promise.resolve()
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)))
      return
    }
    trackPendingRebuildEnqueue(settled)
    return
  }
  trackPendingRebuildEnqueue(Promise.resolve(result).then(() => onEnqueued?.()))
}

export async function waitForBestEffortRebuildEnqueuesForTest(): Promise<void> {
  await Promise.allSettled(pendingBestEffortRebuildEnqueues)
}

function trackPendingRebuildEnqueue(result: Promise<unknown>): void {
  const pending = result.finally(() => {
    pendingBestEffortRebuildEnqueues.delete(pending)
  })
  pendingBestEffortRebuildEnqueues.add(pending)
  void pending.catch(onError)
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value != null &&
    typeof value === 'object' &&
    typeof (value as { then?: unknown }).then === 'function'
  )
}
