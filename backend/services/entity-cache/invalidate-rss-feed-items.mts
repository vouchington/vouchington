import { enqueueBulkPurgeCacheTags } from '@queues/cache-purge/enqueues'
import { rssFeedItemTag } from '@ts-shared/cache'
import { caches } from './caches.mts'
import { getRssFeedItemCacheKeys } from './keys.mts'

export async function invalidateRssFeedItemsAndWaitForPurge(...keys: unknown[]): Promise<void> {
  // ast-grep-ignore: no-three-sequential-awaits -- resolve item keys before deleting local cache entries; finish local deletion before CDN purge admission so purged requests cannot refill from stale local cache
  const rssFeedItemKeys = await getRssFeedItemCacheKeys(...keys)
  await caches.rss_feed_items.invalidateCacheGetByAny(...rssFeedItemKeys)
  await enqueueBulkPurgeCacheTags(rssFeedItemKeys.map(rssFeedItemTag))
}
