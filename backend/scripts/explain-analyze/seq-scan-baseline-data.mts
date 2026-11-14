// Baseline from paired CI runs 38564850912 and 38992552694 with five-relation seed VACUUM.
// These fingerprints appeared in both captures; remove each entry when its scan is fixed.
// PR #3018 removed 48 story-hydration rss_feeds/topics fingerprints after keyed RSS feed
// hydration passed paired custom/generic captures (2026-10-17T02-25-09-194Z).
export const BASELINE_FINGERPRINTS = [
  // The bounded hostname candidate probes one small recent crawl partition.
  'crawler-boilerplate-candidates|0|searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId:force_custom_plan|force_custom_plan:crawls',
  // Engagement recipients are globally ranked by claimed-at fairness across eligible users.
  // Paired CI 42086515835 also selected these custom scans after the prompt fixture grew users.
  'engagement-follow-news-sources|0|getFollowNewsSourcesRecipients:force_custom_plan|force_custom_plan:relation__user__follow__rss_feed',
  'engagement-follow-news-sources|0|getFollowNewsSourcesRecipients:force_custom_plan|force_custom_plan:users',
  'engagement-follow-news-sources|0|getFollowNewsSourcesRecipients:force_generic_plan|force_generic_plan:relation__user__follow__rss_feed',
  'engagement-follow-news-sources|0|getFollowNewsSourcesRecipients:force_generic_plan|force_generic_plan:users',
  'engagement-follow-topics|0|getFollowTopicsRecipients:force_custom_plan|force_custom_plan:relation__user__follow__topic',
  'engagement-follow-topics|0|getFollowTopicsRecipients:force_custom_plan|force_custom_plan:users',
  'engagement-follow-topics|0|getFollowTopicsRecipients:force_generic_plan|force_generic_plan:relation__user__follow__topic',
  'engagement-follow-topics|0|getFollowTopicsRecipients:force_generic_plan|force_generic_plan:users',
  'engagement-post-referral-link|0|getPostReferralLinkRecipients:force_custom_plan|force_custom_plan:users',
  'engagement-post-referral-link|0|getPostReferralLinkRecipients:force_generic_plan|force_generic_plan:users',
  'mv-platform-stats-refresh|0|mv-platform-stats-refresh:force_custom_plan|force_custom_plan:topics',
  'mv-platform-stats-refresh|0|mv-platform-stats-refresh:force_generic_plan|force_generic_plan:topics',
  'mv-rss-feed-crawl-tiers-refresh|0|mv-rss-feed-crawl-tiers-refresh:force_custom_plan|force_custom_plan:relation__user__follow__rss_feed',
  'mv-rss-feed-crawl-tiers-refresh|0|mv-rss-feed-crawl-tiers-refresh:force_custom_plan|force_custom_plan:rss_feeds',
  'mv-rss-feed-crawl-tiers-refresh|0|mv-rss-feed-crawl-tiers-refresh:force_custom_plan|force_custom_plan:topics',
  'mv-rss-feed-crawl-tiers-refresh|0|mv-rss-feed-crawl-tiers-refresh:force_generic_plan|force_generic_plan:relation__user__follow__rss_feed',
  'mv-rss-feed-crawl-tiers-refresh|0|mv-rss-feed-crawl-tiers-refresh:force_generic_plan|force_generic_plan:rss_feeds',
  'mv-rss-feed-crawl-tiers-refresh|0|mv-rss-feed-crawl-tiers-refresh:force_generic_plan|force_generic_plan:topics',
  'mv-trending-communities-refresh|0|mv-trending-communities-refresh:force_custom_plan|force_custom_plan:community_post_reviews',
  'mv-trending-communities-refresh|0|mv-trending-communities-refresh:force_generic_plan|force_generic_plan:community_post_reviews',
  'notifications-unread-summary|0|getUnreadNotificationsSummary:force_custom_plan|force_custom_plan:notifications',
  'notifications-unread-summary|0|getUnreadNotificationsSummary:force_generic_plan|force_generic_plan:notifications',
  'recommended-topics|0|buildRecommendationQuery:force_custom_plan|force_custom_plan:topics',
  'search-admin-users-email|0|searchAdminUsers:email:force_custom_plan|force_custom_plan:users',
  'search-admin-users-email|0|searchAdminUsers:email:force_generic_plan|force_generic_plan:users',
  'search-admin-users-uuid|0|searchAdminUsers:uuid:force_generic_plan|force_generic_plan:users',
  'search-admin-users|0|searchAdminUsers:prefix:force_generic_plan|force_generic_plan:users',
  'topic-metrics-batch|0|getTopicMetricsByAnyBatch:force_custom_plan|force_custom_plan:rss_feeds',
  'topic-search-best|0|buildTopicSearchQuery:force_custom_plan|force_custom_plan:topics',
  'topic-search-best|0|buildTopicSearchQuery:force_generic_plan|force_generic_plan:topics',
  'topic-search-text|0|buildTopicSearchQuery:force_custom_plan|force_custom_plan:topics',
] as const
