import { workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { workerQueueCommandClient } from './glide-mq-shared-client.mts'

/** Own admission fences before enqueueing, even when the eventual page receipt write fails. */
export function createPagedDispatchFences(
  queueName: string,
  pageId: string,
  prefix = workerQueuePrefix,
) {
  const namespace = `${prefix ?? 'glide'}:{${queueName}}`
  const owned = `${namespace}:dispatch-fences:${pageId}`
  return {
    async checkpoint(ids: string[]): Promise<void> {
      if (ids.length) await workerQueueCommandClient.sadd(owned, ids)
    },
    async clearPage(limit: number): Promise<boolean> {
      // Positive SRANDMEMBER returns at most this many distinct fields. Deleting each batch
      // guarantees progress without loading an unbounded set or relying on unstable offsets.
      const ids = await workerQueueCommandClient.srandmemberCount(owned, limit)
      if (ids.length) {
        await workerQueueCommandClient.hdel(`${namespace}:dedup`, ids)
        // Remove ownership only after HDEL succeeds; retrying either operation is harmless.
        await workerQueueCommandClient.srem(owned, ids)
      }
      return (await workerQueueCommandClient.scard(owned)) === 0
    },
  }
}
