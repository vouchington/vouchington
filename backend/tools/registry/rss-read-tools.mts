import { rssFeedReadTools } from '../rss-feed-reads.mts'
import { rssFeedItemReadTools } from '../rss-feed-item-reads.mts'
import { rssFeedDiscoveryTools } from '../rss-feed-discovery.mts'
import { rssFeedCrawlReadTools } from '../rss-feed-crawl-reads.mts'
import { rssFeedItemSocialReadTools } from '../rss-feed-item-social-reads.mts'
import getPostFeedTool from '../get-post-feed.mts'
import getRssFeedItemFeedTool from '../get-rss-feed-item-feed.mts'
import getReferralLinkFeedTool from '../get-referral-link-feed.mts'
import searchRssFeedItemsTool from '../search-rss-feed-items.mts'

export const rssReadTools = [
  ...rssFeedReadTools,
  ...rssFeedItemReadTools,
  ...rssFeedDiscoveryTools,
  ...rssFeedCrawlReadTools,
  ...rssFeedItemSocialReadTools,
  getPostFeedTool,
  getRssFeedItemFeedTool,
  getReferralLinkFeedTool,
  searchRssFeedItemsTool,
]
