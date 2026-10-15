/**
 * Logged-out search/list Valkey prefixes.
 *
 * `invalidateAnonymousSearchCaches` sweeps this list. RSS feed search lives in
 * `entity-fetch/rss-feeds.mts` and must import `RSS_FEEDS_ANON_CACHE` from here instead of
 * `search-caches.mts`, which eagerly loads the other search domains.
 */
export const POST_IDS_ANON_CACHE = 'post_ids_anon'
export const TOPIC_IDS_ANON_CACHE = 'topic_ids_anon'
export const RSS_FEEDS_ANON_CACHE = 'rss_feeds_anon'
export const RSS_FEED_ITEMS_ANON_CACHE = 'rss_feed_items_anon'
export const COMMUNITIES_ANON_CACHE = 'communities_anon'
export const TRENDING_TOPICS_ANON_CACHE = 'trending_topics_anon'
export const URL_HOSTNAMES_ANON_CACHE = 'url_hostnames_anon_v2'
export const TOP_HOSTNAMES_ANON_CACHE = 'top_hostnames_anon'
export const TRENDING_RSS_FEEDS_ANON_CACHE = 'trending_rss_feeds_anon'
export const TRENDING_POSTS_ANON_CACHE = 'trending_posts_anon'
export const TRENDING_COMMUNITIES_ANON_CACHE = 'trending_communities_anon'
export const PLATFORM_STATS_ANON_CACHE = 'platform_stats_anon'

export const ANONYMOUS_SEARCH_CACHE_PREFIXES = [
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
