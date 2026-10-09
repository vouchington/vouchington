import { enqueueDeleteUserBookmarkBloomFilter } from '@queues/bloom-filters/enqueues'
import onError from '@modules/on-error'

// The queue factory already reports rejected enqueues via its own internal onError call;
// Guard synchronous throws and return a settled promise so callers can finish the enqueue.
export function enqueueDeleteUserBookmarkBloomFilterBestEffort(userId: string): Promise<void> {
  try {
    return enqueueDeleteUserBookmarkBloomFilter({ userId }).then(
      () => undefined,
      settleReportedBookmarkEnqueue,
    )
  } catch (err) {
    /* v8 ignore next 2 -- Valkey remains real in tests; forcing the queue's internal add() to throw synchronously would destabilize shared test state. */
    onError(err instanceof Error ? err : new Error(String(err)))
    return Promise.resolve()
  }
}

// The production queue factory reports this rejection before returning its enqueue promise.
function settleReportedBookmarkEnqueue(): undefined {
  return undefined
}
