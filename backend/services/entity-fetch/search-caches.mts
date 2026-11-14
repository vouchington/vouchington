// IMPORTANT: Use direct file imports here, NOT barrel imports.
// This module is NOT re-exported from @services/entity-fetch to avoid eager loading.
// Import directly: import { ... } from '@services/entity-fetch/search-caches'
import { getPostIds } from '@services/posts/search/get-ids'
import type { PostSearchOptions } from '@services/posts/search/types'
import { getTopicIds } from '@services/topics/search/get-ids'
import type { TopicSearchOptions } from '@services/topics/search/types'
import { searchRssFeedItems, type SearchRssFeedItemsOptions } from '@services/rss-feed-items/search'
import { searchCommunities } from '@services/communities/search'
import { getTrendingTopics } from '@services/trending-topics/get-trending-topics'
import type { TrendingTopicsOptions } from '@services/trending-topics/types'
import { searchUrlHostnames, type SearchUrlHostnamesOptions } from '@services/urls-hostnames/search'
import { getPlatformStats } from '@services/platform-stats/get-platform-stats'
import {
  COMMUNITIES_ANON_CACHE,
  PLATFORM_STATS_ANON_CACHE,
  POST_IDS_ANON_CACHE,
  RSS_FEED_ITEMS_ANON_CACHE,
  TOPIC_IDS_ANON_CACHE,
  TRENDING_TOPICS_ANON_CACHE,
  URL_HOSTNAMES_ANON_CACHE,
} from '@services/entity-cache/anonymous-search-prefixes'
import { createSearchCache } from '@services/entity-cache/search-cache'

export const getPostIdsCached = createSearchCache(
  POST_IDS_ANON_CACHE,
  (options: PostSearchOptions) => getPostIds(undefined, options),
)

export const getTopicIdsCached = createSearchCache(
  TOPIC_IDS_ANON_CACHE,
  (options: TopicSearchOptions) => getTopicIds(options),
)

export const searchRssFeedItemsCached = createSearchCache(
  RSS_FEED_ITEMS_ANON_CACHE,
  (options: SearchRssFeedItemsOptions) => searchRssFeedItems(options),
)

export const searchCommunitiesCached = createSearchCache(
  COMMUNITIES_ANON_CACHE,
  (
    options: Omit<NonNullable<Parameters<typeof searchCommunities>[0]>, 'currentUser'> & {
      currentUser?: null | undefined
    },
  ) => searchCommunities(options),
)

export const getTrendingTopicsCached = createSearchCache(
  TRENDING_TOPICS_ANON_CACHE,
  (options: TrendingTopicsOptions) => getTrendingTopics(options),
)

export const searchUrlHostnamesCached = createSearchCache(
  URL_HOSTNAMES_ANON_CACHE,
  (options: SearchUrlHostnamesOptions) => searchUrlHostnames(options),
)

export const getPlatformStatsCached = createSearchCache(
  PLATFORM_STATS_ANON_CACHE,
  (_options: Record<string, never>) => getPlatformStats(),
)
