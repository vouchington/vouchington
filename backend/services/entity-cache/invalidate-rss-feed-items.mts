import { caches } from './caches.mts'
import { getRssFeedItemCacheKeys } from './keys.mts'

export async function invalidateRssFeedItemsStrict(...keys: unknown[]): Promise<void> {
  const rssFeedItemKeys = await getRssFeedItemCacheKeys(...keys)
  await caches.rss_feed_items.invalidateCacheGetByAny(...rssFeedItemKeys)
}
