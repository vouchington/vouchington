import addEntityRelationTool from '../add-entity-relation.mts'
import compareTopicsTool from '../compare-topics.mts'
import getCommunityMembersTool from '../get-community-members.mts'
import getCommunityPinnedPostsTool from '../get-community-pinned-posts.mts'
import getCommunityPostsTool from '../get-community-posts.mts'
import getCommunityTool from '../get-community.mts'
import getDomainRatingsTool from '../get-domain-ratings.mts'
import getMyCardsTool from '../get-my-cards.mts'
import getMyPointValuationsTool from '../get-my-point-valuations.mts'
import getMyProfileTool from '../get-my-profile.mts'
import getMyRewardsStatusesTool from '../get-my-rewards-statuses.mts'
import getMySpendingTool from '../get-my-spending.mts'
import getPostAncestorsTool from '../get-post-ancestors.mts'
import getPostDescendantsTool from '../get-post-descendants.mts'
import getPostTool from '../get-post.mts'
import getRecommendedTopicsTool from '../get-recommended-topics.mts'
import getReferralLinksTool from '../get-referral-links.mts'
import getStoryTool from '../get-story.mts'
import getTopicDetailsTool from '../get-topic-details.mts'
import getTopicInsightsTool from '../get-topic-insights.mts'
import getTopicMetricsTool from '../get-topic-metrics.mts'
import getTrendingPostsTool from '../get-trending-posts.mts'
import getTrendingTopicsTool from '../get-trending-topics.mts'
import manageMyCardsTool from '../manage-my-cards.mts'
import manageMyPointValuationsTool from '../manage-my-point-valuations.mts'
import manageMyRewardsStatusesTool from '../manage-my-rewards-statuses.mts'
import manageMySpendingTool from '../manage-my-spending.mts'
import searchCommunitiesTool from '../search-communities.mts'
import searchDataPointsTool from '../search-data-points.mts'
import searchPostsTool from '../search-posts.mts'
import searchRssFeedItemsTool from '../search-rss-feed-items.mts'
import searchTopicsTool from '../search-topics.mts'
import updateMyFinancialProfileTool from '../update-my-financial-profile.mts'
import type { Tool } from '../types.mts'

export const ALL_TOOLS: readonly Tool[] = [
  addEntityRelationTool,
  compareTopicsTool,
  getCommunityMembersTool,
  getCommunityPinnedPostsTool,
  getCommunityPostsTool,
  getCommunityTool,
  getDomainRatingsTool,
  getMyCardsTool,
  getMyPointValuationsTool,
  getMyProfileTool,
  getMyRewardsStatusesTool,
  getMySpendingTool,
  getPostAncestorsTool,
  getPostDescendantsTool,
  getPostTool,
  getRecommendedTopicsTool,
  getReferralLinksTool,
  getStoryTool,
  getTopicDetailsTool,
  getTopicInsightsTool,
  getTopicMetricsTool,
  getTrendingPostsTool,
  getTrendingTopicsTool,
  manageMyCardsTool,
  manageMyPointValuationsTool,
  manageMyRewardsStatusesTool,
  manageMySpendingTool,
  searchCommunitiesTool,
  searchDataPointsTool,
  searchPostsTool,
  searchRssFeedItemsTool,
  searchTopicsTool,
  updateMyFinancialProfileTool,
] as unknown as Tool[]

export function getRegisteredToolByName(name: string): Tool | undefined {
  return ALL_TOOLS.find(tool => tool.schema.name === name)
}
