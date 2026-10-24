/**
 * Logged-out search/list Valkey prefixes.
 *
 * RSS feed search lives in `entity-fetch/rss-feeds.mts` and imports its prefix from here
 * instead of eagerly loading the other search domains through `search-caches.mts`.
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
