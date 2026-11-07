// Baseline from paired CI runs 38564850912 and 38992552694 with five-relation seed VACUUM.
// These fingerprints appeared in both captures; remove each entry when its scan is fixed.
// PR #3018 removed 48 story-hydration rss_feeds/topics fingerprints after keyed RSS feed
// hydration passed paired custom/generic captures (2026-10-17T02-25-09-194Z).
export const BASELINE_FINGERPRINTS = [
  // The bounded hostname candidate probes one small recent crawl partition.
  'crawler-boilerplate-candidates|0|searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId:force_custom_plan|force_custom_plan:crawls',
  // Paired CI 42360011422: 1,000 item sources cover 39% of live feeds. The custom
  // hash scan uses 179 buffers versus 1,518 for the observed generic PK lookup path;
  // keep the 1,100-source / 2,600-feed row gates and the generic walk unchanged.
  'deleted-parent-source-feeds|0|listLiveItemSourceFeedsPage:force_custom_plan|force_custom_plan:rss_feeds',
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
  'mv-platform-stats-refresh|0|mv-platform-stats-refresh:force_custom_plan|force_custom_plan:posts',
  'mv-platform-stats-refresh|0|mv-platform-stats-refresh:force_custom_plan|force_custom_plan:topics',
  'mv-platform-stats-refresh|0|mv-platform-stats-refresh:force_generic_plan|force_generic_plan:posts',
  'mv-platform-stats-refresh|0|mv-platform-stats-refresh:force_generic_plan|force_generic_plan:topics',
  'mv-rss-feed-crawl-tiers-refresh|0|mv-rss-feed-crawl-tiers-refresh:force_custom_plan|force_custom_plan:relation__user__follow__rss_feed',
  'mv-rss-feed-crawl-tiers-refresh|0|mv-rss-feed-crawl-tiers-refresh:force_custom_plan|force_custom_plan:rss_feeds',
  'mv-rss-feed-crawl-tiers-refresh|0|mv-rss-feed-crawl-tiers-refresh:force_custom_plan|force_custom_plan:topics',
  'mv-rss-feed-crawl-tiers-refresh|0|mv-rss-feed-crawl-tiers-refresh:force_generic_plan|force_generic_plan:relation__user__follow__rss_feed',
  'mv-rss-feed-crawl-tiers-refresh|0|mv-rss-feed-crawl-tiers-refresh:force_generic_plan|force_generic_plan:rss_feeds',
  'mv-rss-feed-crawl-tiers-refresh|0|mv-rss-feed-crawl-tiers-refresh:force_generic_plan|force_generic_plan:topics',
  'notifications-unread-summary|0|getUnreadNotificationsSummary:force_custom_plan|force_custom_plan:notifications',
  'notifications-unread-summary|0|getUnreadNotificationsSummary:force_generic_plan|force_generic_plan:notifications',
  'post-search-following-new-heavy-follows|0|buildPostSearchQuery:following-new-heavy:force_generic_plan|force_generic_plan:posts',
  'post-search-hot|0|buildPostSearchQuery:force_generic_plan|force_generic_plan:posts',
  'post-search-hybrid-new|0|buildPostSearchQuery:force_generic_plan|force_generic_plan:posts',
  'post-search-hybrid-relevance|0|buildPostSearchQuery:force_generic_plan|force_generic_plan:posts',
  'post-search-semantic-hot|0|buildPostSearchQuery:force_generic_plan|force_generic_plan:posts',
  'post-search-semantic-new|0|buildPostSearchQuery:force_generic_plan|force_generic_plan:posts',
  // PR #4972 accepts the 30-day exact-sort path; clean a9d793 and PR captures both use it.
  // Keep this control explicit rather than depending on unrelated planner-cost near ties.
  'post-search-semantic-new-1m|0|buildPostSearchQuery:force_custom_plan|force_custom_plan:posts',
  'post-search-semantic-new-1m|0|buildPostSearchQuery:force_generic_plan|force_generic_plan:posts',
  'post-search-semantic-relevance|0|buildPostSearchQuery:force_generic_plan|force_generic_plan:posts',
  'recommended-topics|0|buildRecommendationQuery:force_custom_plan|force_custom_plan:topics',
  'rss-feed-item-feed-heavy-all|0|getRssFeedItemFeedIds:heavy-all:force_custom_plan|force_custom_plan:rss_feed_item_categories',
  'rss-feed-item-feed-heavy-follow-topics|0|getRssFeedItemFeedIds:heavy-follow-topics:force_custom_plan|force_custom_plan:rss_feed_item_categories',
  'rss-feed-item-feed-heavy-follows-after|0|getRssFeedItemFeedIds:heavy:force_custom_plan|force_custom_plan:rss_feed_item_categories',
  'rss-feed-item-feed-heavy-follows|0|getRssFeedItemFeedIds:heavy:force_custom_plan|force_custom_plan:rss_feed_item_categories',
  'rss-feed-item-feed-heavy-story-skew|0|getRssFeedItemFeedIds:force_custom_plan|force_custom_plan:rss_feed_item_categories',
  'search-admin-users-email|0|searchAdminUsers:email:force_custom_plan|force_custom_plan:users',
  'search-admin-users-email|0|searchAdminUsers:email:force_generic_plan|force_generic_plan:users',
  'search-admin-users-uuid|0|searchAdminUsers:uuid:force_generic_plan|force_generic_plan:users',
  'search-admin-users|0|searchAdminUsers:prefix:force_generic_plan|force_generic_plan:users',
  'topic-metrics-batch|0|getTopicMetricsByAnyBatch:force_custom_plan|force_custom_plan:rss_feed_item_categories',
  'topic-metrics-batch|0|getTopicMetricsByAnyBatch:force_custom_plan|force_custom_plan:rss_feeds',
  'topic-search-best|0|buildTopicSearchQuery:force_custom_plan|force_custom_plan:topics',
  'topic-search-best|0|buildTopicSearchQuery:force_generic_plan|force_generic_plan:topics',
  'topic-search-text|0|buildTopicSearchQuery:force_custom_plan|force_custom_plan:topics',
  'trending-topics|0|getTrendingTopics:force_custom_plan|force_custom_plan:topics',
  'trending-topics|0|getTrendingTopics:force_generic_plan|force_generic_plan:topics',
  'user-metrics-batch|0|getUserMetricsByAnyBatch:force_generic_plan|force_generic_plan:relation__user__follow__rss_feed',
  'user-metrics-batch|0|getUserMetricsByAnyBatch:force_generic_plan|force_generic_plan:relation__user__follow__topic',
  // Paired CI 42360011422: eligible joins inspect 4,050 review tuples once for
  // the 2,000-review author fixture. Custom plans use 246/449 buffers versus
  // 6,297/6,300 for the observed generic indexed plans.
  // The same uncapped single-walk controls choose these scans; existing row gates stay.
  'user-removed-community-posts-page|0|listUserRemovedPosts:force_custom_plan|force_custom_plan:community_post_reviews',
  'user-removed-posts-page|0|listUserRemovedPosts:force_custom_plan|force_custom_plan:community_post_reviews',
] as const
