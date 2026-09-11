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
import {
  searchTopHostnames,
  type SearchTopHostnamesOptions,
} from '@services/urls-hostnames/search-top'
import { getTrendingRssFeeds } from '@services/trending-rss-feeds/get-trending-rss-feeds'
import type { TrendingRssFeedsOptions } from '@services/trending-rss-feeds/types'
import { getTrendingPosts } from '@services/trending-posts/get-trending-posts'
import type { TrendingPostsOptions } from '@services/trending-posts/types'
import { getTrendingCommunities } from '@services/trending-communities/get-trending-communities'
import type { TrendingCommunityOptions } from '@services/trending-communities/types'
import { getPlatformStats } from '@services/platform-stats/get-platform-stats'
import { createSearchCache, invalidateSearchCache } from '@services/entity-cache/search-cache'

const POST_IDS_ANON_CACHE = 'post_ids_anon'
const TOPIC_IDS_ANON_CACHE = 'topic_ids_anon'
const RSS_FEEDS_ANON_CACHE = 'rss_feeds_anon'
const RSS_FEED_ITEMS_ANON_CACHE = 'rss_feed_items_anon'
const COMMUNITIES_ANON_CACHE = 'communities_anon'
const TRENDING_TOPICS_ANON_CACHE = 'trending_topics_anon'
const URL_HOSTNAMES_ANON_CACHE = 'url_hostnames_anon_v2'
const TOP_HOSTNAMES_ANON_CACHE = 'top_hostnames_anon'
const TRENDING_RSS_FEEDS_ANON_CACHE = 'trending_rss_feeds_anon'
const TRENDING_POSTS_ANON_CACHE = 'trending_posts_anon'
const TRENDING_COMMUNITIES_ANON_CACHE = 'trending_communities_anon'
const PLATFORM_STATS_ANON_CACHE = 'platform_stats_anon'

const ANONYMOUS_SEARCH_CACHE_PREFIXES = [
  POST_IDS_ANON_CACHE,
  TOPIC_IDS_ANON_CACHE,
  RSS_FEEDS_ANON_CACHE,
  RSS_FEED_ITEMS_ANON_CACHE,
  COMMUNITIES_ANON_CACHE,
  TRENDING_TOPICS_ANON_CACHE,
  URL_HOSTNAMES_ANON_CACHE,
  TOP_HOSTNAMES_ANON_CACHE,
  TRENDING_RSS_FEEDS_ANON_CACHE,
  TRENDING_POSTS_ANON_CACHE,
  TRENDING_COMMUNITIES_ANON_CACHE,
  PLATFORM_STATS_ANON_CACHE,
] as const

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

export const searchTopHostnamesCached = createSearchCache(
  TOP_HOSTNAMES_ANON_CACHE,
  (options: SearchTopHostnamesOptions) => searchTopHostnames(options),
)

export const getTrendingRssFeedsCached = createSearchCache(
  TRENDING_RSS_FEEDS_ANON_CACHE,
  (options: TrendingRssFeedsOptions) => getTrendingRssFeeds(options),
)

export const getTrendingPostsCached = createSearchCache(
  TRENDING_POSTS_ANON_CACHE,
  (options: TrendingPostsOptions) => getTrendingPosts(options),
)

export const getTrendingCommunitiesCached = createSearchCache(
  TRENDING_COMMUNITIES_ANON_CACHE,
  (options: TrendingCommunityOptions) => getTrendingCommunities(options),
)

export const getPlatformStatsCached = createSearchCache(
  PLATFORM_STATS_ANON_CACHE,
  (_options: Record<string, never>) => getPlatformStats(),
)

export async function invalidateAnonymousSearchCaches(): Promise<void> {
  await Promise.all(ANONYMOUS_SEARCH_CACHE_PREFIXES.map(prefix => invalidateSearchCache(prefix)))
}
