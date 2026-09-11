import addRelatedTopicTool from '../add-related-topic.mts'
import compareTopicsTool from '../compare-topics.mts'
import createWikipediaTopicRecommendationTool from '../create-wikipedia-topic-recommendation.mts'
import getDomainRatingsTool from '../get-domain-ratings.mts'
import getMyProfileTool from '../get-my-profile.mts'
import getRecommendedTopicsTool from '../get-recommended-topics.mts'
import getReferralLinksTool from '../get-referral-links.mts'
import getTopicDetailsTool from '../get-topic-details.mts'
import getTopicHierarchyTool from '../get-topic-hierarchy.mts'
import getTopicInsightsTool from '../get-topic-insights.mts'
import getTopicMetricsTool from '../get-topic-metrics.mts'
import getTrendingPostsTool from '../get-trending-posts.mts'
import getTrendingTopicsTool from '../get-trending-topics.mts'
import getWikipediaSummaryTool from '../get-wikipedia-summary.mts'
import manageMyCardsTool from '../manage-my-cards.mts'
import manageMyPointValuationsTool from '../manage-my-point-valuations.mts'
import manageMyRewardsStatusesTool from '../manage-my-rewards-statuses.mts'
import manageMySpendingTool from '../manage-my-spending.mts'
import searchCrawlChunksTool from '../search-crawl-chunks.mts'
import searchCrawlsSemanticTool from '../search-crawls-semantic.mts'
import searchCrawlsTool from '../search-crawls.mts'
import searchDataPointsTool from '../search-data-points.mts'
import searchPostsSemanticTool from '../search-posts-semantic.mts'
import searchPostsTool from '../search-posts.mts'
import searchRssFeedItemsTool from '../search-rss-feed-items.mts'
import searchSupportMessagesTool from '../search-support-messages.mts'
import searchTopicsSemanticTool from '../search-topics-semantic.mts'
import searchTopicsTextTool from '../search-topics-text.mts'
import searchTopicsTool from '../search-topics.mts'
import searchWikipediaTool from '../search-wikipedia.mts'
import updateMyFinancialProfileTool from '../update-my-financial-profile.mts'
import type { Tool } from '../types.mts'

export const ALL_TOOLS: readonly Tool[] = [
  addRelatedTopicTool,
  compareTopicsTool,
  createWikipediaTopicRecommendationTool,
  getDomainRatingsTool,
  getMyProfileTool,
  getRecommendedTopicsTool,
  getReferralLinksTool,
  getTopicDetailsTool,
  getTopicHierarchyTool,
  getTopicInsightsTool,
  getTopicMetricsTool,
  getTrendingPostsTool,
  getTrendingTopicsTool,
  getWikipediaSummaryTool,
  manageMyCardsTool,
  manageMyPointValuationsTool,
  manageMyRewardsStatusesTool,
  manageMySpendingTool,
  searchCrawlChunksTool,
  searchCrawlsSemanticTool,
  searchCrawlsTool,
  searchDataPointsTool,
  searchPostsSemanticTool,
  searchPostsTool,
  searchRssFeedItemsTool,
  searchSupportMessagesTool,
  searchTopicsSemanticTool,
  searchTopicsTextTool,
  searchTopicsTool,
  searchWikipediaTool,
  updateMyFinancialProfileTool,
] as unknown as Tool[]

export function getRegisteredToolByName(name: string): Tool | undefined {
  return ALL_TOOLS.find(tool => tool.schema.name === name)
}
