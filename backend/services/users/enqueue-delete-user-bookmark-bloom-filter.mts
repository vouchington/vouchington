import { enqueueDeleteUserBookmarkBloomFilter } from '@queues/bloom-filters/enqueues'
import onError from '@modules/on-error'

// The queue factory already reports rejected enqueues via its own internal onError call;
// Guard synchronous throws and return a settled promise so callers can finish the enqueue.
type BookmarkEnqueueDependencies = {
  enqueue: typeof enqueueDeleteUserBookmarkBloomFilter
  reportError: typeof onError
}

export function enqueueDeleteUserBookmarkBloomFilterBestEffort(
  userId: string,
  dependencies: Partial<BookmarkEnqueueDependencies> = {},
): Promise<void> {
  const enqueue = dependencies.enqueue ?? enqueueDeleteUserBookmarkBloomFilter
  const reportError = dependencies.reportError ?? onError
  try {
    return enqueue({ userId }).then(() => undefined, settleReportedBookmarkEnqueue)
  } catch (err) {
    reportError(err instanceof Error ? err : new Error(String(err)))
    return Promise.resolve()
  }
}

// The production queue factory reports this rejection before returning its enqueue promise.
function settleReportedBookmarkEnqueue(): undefined {
  return undefined
}
