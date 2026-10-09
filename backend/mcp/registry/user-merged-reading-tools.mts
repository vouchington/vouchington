import {
  getRssFeedItemFollowContextTool as read_rss_feed_item_follow_context,
  getRssFeedItemVotesTool as read_rss_feed_item_votes,
} from '../rss-feed-item-social-reads.mts'
import {
  listRssFeedItemsTool as read_rss_feed_item_list,
  getRssFeedItemTool as read_rss_feed_item_details,
} from '../rss-feed-item-reads.mts'
import {
  listRssFeedCrawlsTool as read_rss_feed_crawls,
  getRssFeedCrawlTool as read_rss_feed_crawl,
} from '../rss-feed-crawl-reads.mts'
import {
  getTrendingRssFeedsTool as discover_rss_feeds_trending,
  getRecommendedRssFeedsTool as discover_rss_feeds_recommended,
} from '../rss-feed-discovery.mts'
import {
  searchRssFeedsTool as discover_rss_feeds_search,
  getRssFeedTool as read_rss_feed_details,
} from '../rss-feed-reads.mts'
import { createMergedTool } from '../create-merged-tool.mts'
import read_community_list_item_counts from '../get-community-list-item-counts.mts'
import read_community_list_items from '../get-community-list-items.mts'
import read_community_members from '../get-community-members.mts'
import read_community_pinned_posts from '../get-community-pinned-posts.mts'
import read_community_posts from '../get-community-posts.mts'
import read_community_details from '../get-community.mts'
import read_reference_data_membership_plans from '../get-membership-plans.mts'
import read_reference_data_platform_stats from '../get-platform-stats.mts'
import read_reference_data_countries from '../list-countries.mts'
import read_reference_data_currencies from '../list-currencies.mts'
import read_topic_referral_program from '../get-topic-referral-program.mts'
import read_topic_compare from '../compare-topics.mts'
import read_topic_details from '../get-topic-details.mts'
import read_topic_metrics from '../get-topic-metrics.mts'
import discover_communities_trending from '../get-trending-communities.mts'
import discover_communities_search from '../search-communities.mts'
import discover_topics_trending_referral_programs from '../get-trending-referral-programs.mts'
import discover_topics_trending from '../get-trending-topics.mts'
import discover_topics_search from '../search-topics.mts'
import read_feed_posts from '../get-post-feed.mts'
import read_feed_rss_items from '../get-rss-feed-item-feed.mts'
import read_feed_referral_links from '../get-referral-link-feed.mts'
import read_posts_ancestors from '../get-post-ancestors.mts'
import read_posts_descendants from '../get-post-descendants.mts'
import read_posts_details from '../get-post.mts'
import read_posts_trending from '../get-trending-posts.mts'
import read_posts_search from '../search-posts.mts'
import read_hostnames_top from '../get-top-hostnames.mts'
import read_hostnames_search from '../search-hostnames.mts'
import read_data_points_topic_insights from '../get-topic-insights.mts'
import read_data_points_search from '../search-data-points.mts'
import read_users_details from '../get-user.mts'
import read_users_search from '../search-users.mts'
export const userMergedReadingGroups = [
  {
    name: 'read_community',
    options: [
      { option: 'list_item_counts', source: read_community_list_item_counts },
      { option: 'list_items', source: read_community_list_items },
      { option: 'members', source: read_community_members },
      { option: 'pinned_posts', source: read_community_pinned_posts },
      { option: 'posts', source: read_community_posts },
      { option: 'details', source: read_community_details },
    ],
  },
  {
    name: 'read_reference_data',
    options: [
      { option: 'membership_plans', source: read_reference_data_membership_plans },
      { option: 'platform_stats', source: read_reference_data_platform_stats },
      { option: 'countries', source: read_reference_data_countries },
      { option: 'currencies', source: read_reference_data_currencies },
    ],
  },
  {
    name: 'read_topic',
    options: [
      { option: 'referral_program', source: read_topic_referral_program },
      { option: 'compare', source: read_topic_compare },
      { option: 'details', source: read_topic_details },
      { option: 'metrics', source: read_topic_metrics },
    ],
  },
  {
    name: 'discover_communities',
    options: [
      { option: 'trending', source: discover_communities_trending },
      { option: 'search', source: discover_communities_search },
    ],
  },
  {
    name: 'discover_topics',
    options: [
      { option: 'trending_referral_programs', source: discover_topics_trending_referral_programs },
      { option: 'trending', source: discover_topics_trending },
      { option: 'search', source: discover_topics_search },
    ],
  },
  {
    name: 'discover_rss_feeds',
    options: [
      { option: 'search', source: discover_rss_feeds_search },
      { option: 'trending', source: discover_rss_feeds_trending },
      { option: 'recommended', source: discover_rss_feeds_recommended },
    ],
  },
  {
    name: 'read_rss_feed',
    options: [
      { option: 'details', source: read_rss_feed_details },
      { option: 'crawls', source: read_rss_feed_crawls },
      { option: 'crawl', source: read_rss_feed_crawl },
    ],
  },
  {
    name: 'read_rss_feed_item',
    options: [
      { option: 'list', source: read_rss_feed_item_list },
      { option: 'details', source: read_rss_feed_item_details },
      { option: 'follow_context', source: read_rss_feed_item_follow_context },
      { option: 'votes', source: read_rss_feed_item_votes },
    ],
  },
  {
    name: 'read_feed',
    options: [
      { option: 'posts', source: read_feed_posts },
      { option: 'rss_items', source: read_feed_rss_items },
      { option: 'referral_links', source: read_feed_referral_links },
    ],
  },
  {
    name: 'read_posts',
    options: [
      { option: 'ancestors', source: read_posts_ancestors },
      { option: 'descendants', source: read_posts_descendants },
      { option: 'details', source: read_posts_details },
      { option: 'trending', source: read_posts_trending },
      { option: 'search', source: read_posts_search },
    ],
  },
  {
    name: 'read_hostnames',
    options: [
      { option: 'top', source: read_hostnames_top },
      { option: 'search', source: read_hostnames_search },
    ],
  },
  {
    name: 'read_data_points',
    options: [
      { option: 'topic_insights', source: read_data_points_topic_insights },
      { option: 'search', source: read_data_points_search },
    ],
  },
  {
    name: 'read_users',
    options: [
      { option: 'details', source: read_users_details },
      { option: 'search', source: read_users_search },
    ],
  },
] as const
export const userMergedReadingTools = userMergedReadingGroups.map(group =>
  createMergedTool(
    group.name,
    group.name
      .split('_')
      .map(word => word[0]!.toUpperCase() + word.slice(1))
      .join(' '),
    group.options,
  ),
)
