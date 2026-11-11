import { enqueueDeleteUserBookmarkBloomFilter } from '@queues/bloom-filters/enqueues'

// The queue factory already reports rejected enqueues via its own internal onError call;
// return a settled promise so callers can finish the enqueue.
export function enqueueDeleteUserBookmarkBloomFilterBestEffort(userId: string): Promise<void> {
  return enqueueDeleteUserBookmarkBloomFilter({ userId })
    .then(() => undefined)
    .catch(settleReportedBookmarkEnqueue)
}

// The production queue factory reports this rejection before returning its enqueue promise.
function settleReportedBookmarkEnqueue(): undefined {
  return undefined
}
