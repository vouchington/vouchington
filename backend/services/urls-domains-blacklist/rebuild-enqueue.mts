import { enqueueRebuildBloomFilter } from '@queues/bloom-filters/enqueues'
import type { RebuildBloomFilterData } from '@queues/bloom-filters/types'
import onError from '@modules/on-error'

const enqueueRebuildBloomFilterUnknown: (data: RebuildBloomFilterData) => unknown =
  enqueueRebuildBloomFilter
type EnqueueRebuildBloomFilter = (data: RebuildBloomFilterData) => unknown

export function enqueueRebuildBloomFilterBestEffort(
  filter: RebuildBloomFilterData['filter'],
  onEnqueued?: () => Promise<unknown>,
): Promise<unknown> {
  return enqueueRebuildBloomFilterBestEffortWithEnqueue(
    enqueueRebuildBloomFilterUnknown,
    filter,
    onEnqueued,
  )
}

export function enqueueRebuildBloomFilterBestEffortWithEnqueue(
  enqueue: EnqueueRebuildBloomFilter,
  filter: RebuildBloomFilterData['filter'],
  onEnqueued?: () => Promise<unknown>,
): Promise<unknown> {
  let result: unknown
  try {
    result = enqueue({ filter })
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
    return Promise.resolve()
  }

  if (!isPromiseLike(result)) {
    let settled: Promise<unknown>
    try {
      settled = onEnqueued ? Promise.resolve(onEnqueued()) : Promise.resolve()
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)))
      return Promise.resolve()
    }
    return settled.catch(onError)
  }
  return Promise.resolve(result)
    .then(() => onEnqueued?.())
    .catch(onError)
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value != null &&
    typeof value === 'object' &&
    typeof (value as { then?: unknown }).then === 'function'
  )
}
