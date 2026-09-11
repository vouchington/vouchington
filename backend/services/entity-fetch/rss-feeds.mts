import { getRssFeedById } from '@services/rss-feeds/get'
import { getRssFeedsByIdBatch } from '@services/rss-feeds/get-batch'
import { searchRssFeeds, type SearchRssFeedsOptions } from '@services/rss-feeds/search'
import { caches } from '@services/entity-cache/caches'
import { createSearchCache } from '@services/entity-cache/search-cache'

// Must match the 'rss_feeds_anon' prefix entity-cache's invalidateAnonymousSearchCaches
// sweeps in search-caches.mts — do not import that module here (it eagerly pulls in
// ~15 domain services' get/search functions).
const RSS_FEEDS_ANON_CACHE = 'rss_feeds_anon'

export const getRssFeedByIdCached = caches.rss_feeds.cacheGetByAny(getRssFeedById)
export const getRssFeedByIdCachedBatch = caches.rss_feeds.cacheGetByAnyBatch(getRssFeedsByIdBatch)
export const searchRssFeedsCached = createSearchCache(
  RSS_FEEDS_ANON_CACHE,
  (options: SearchRssFeedsOptions) => searchRssFeeds(options),
)
