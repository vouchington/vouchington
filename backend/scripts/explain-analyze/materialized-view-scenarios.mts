/** Each materialized view's defining query is explained by the matching scenario. */
export const MATERIALIZED_VIEW_SCENARIOS = [
  ['mv-top-hashtags-refresh', 'mv_top_hashtags'],
  ['mv-rss-feed-crawl-tiers-refresh', 'mv_rss_feed_crawl_tiers'],
  ['mv-platform-stats-refresh', 'mv_platform_stats'],
  ['mv-trending-rss-feeds-refresh', 'mv_trending_rss_feeds'],
  ['mv-trending-communities-refresh', 'mv_trending_communities'],
  ['mv-trending-topics-refresh', 'mv_trending_topics'],
  ['mv-revenue-memberships-refresh', 'mv_revenue_memberships'],
  ['mv-revenue-changes-refresh', 'mv_revenue_changes'],
] as const

/** Views whose defining query is explained by a dedicated runner with its own seed counts. */
export const DEDICATED_MATERIALIZED_VIEW_SCENARIOS = [
  ['mv-referral-program-link-counts-refresh', 'mv_referral_program_link_counts'],
] as const
