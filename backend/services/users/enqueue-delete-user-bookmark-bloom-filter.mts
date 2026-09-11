import { enqueueDeleteUserBookmarkBloomFilter } from '@queues/bloom-filters/enqueues'
import onError from '@modules/on-error'

// The queue factory already reports rejected enqueues via its own internal onError call;
// this only needs to guard the synchronous-throw path before that promise is returned.
export function enqueueDeleteUserBookmarkBloomFilterBestEffort(userId: string): void {
  try {
    void enqueueDeleteUserBookmarkBloomFilter({ userId })
  } catch (error) {
    /* v8 ignore next 2 -- Valkey remains real in tests; forcing the queue's internal add() to throw synchronously would destabilize shared test state. */
    onError(error instanceof Error ? error : new Error(String(error)))
  }
}
