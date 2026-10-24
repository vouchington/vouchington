import { RSS_FEEDS_ANON_CACHE } from '@services/entity-cache/anonymous-search-prefixes'
import { caches } from '@services/entity-cache/caches'
import { createSearchCache } from '@services/entity-cache/search-cache'
import { getRssFeedById } from '@services/rss-feeds/get'
import { getRssFeedsByIdBatch } from '@services/rss-feeds/get-batch'
import { searchRssFeeds, type SearchRssFeedsOptions } from '@services/rss-feeds/search'

// Do not import search-caches.mts here. It eagerly loads the other search domains.
// Import this prefix directly to avoid eagerly loading the other search domains.

export const getRssFeedByIdCached = caches.rss_feeds.cacheGetByAny(getRssFeedById)
export const getRssFeedByIdCachedBatch = caches.rss_feeds.cacheGetByAnyBatch(getRssFeedsByIdBatch)
export const searchRssFeedsCached = createSearchCache(
  RSS_FEEDS_ANON_CACHE,
  (options: SearchRssFeedsOptions) => searchRssFeeds(options),
)
