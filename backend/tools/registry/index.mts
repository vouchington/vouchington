import { adminEditorialStoryTools } from '../admin/editorial-stories.mts'
import { adminEditorialImportTools } from '../admin/editorial-imports.mts'
import { adminEditorialCategoryTools } from '../admin/editorial-categories.mts'
import { adminEditorialCrawlerTools } from '../admin/editorial-crawlers.mts'
import { adminEditorialReadTools } from '../admin/editorial-reads.mts'
import { adminReportTools } from '../admin/reports.mts'
import { adminClearanceTools } from '../admin/clearances.mts'
import { adminTopicClaimTools } from '../admin/topic-claims.mts'
import { adminWarningTools } from '../admin/warnings.mts'
import { adminUserContextTools } from '../admin/user-context.mts'
import { adminAccountControlTools } from '../admin/account-controls.mts'
import { adminReportIntegrityFlagTools } from '../admin/report-integrity-flags.mts'
import { adminReportIntegrityPenaltyTools } from '../admin/report-integrity-penalties.mts'
import { adminVoteIntegrityFlagTools } from '../admin/vote-integrity-flags.mts'
import { adminVoteIntegrityPenaltyTools } from '../admin/vote-integrity-penalties.mts'
import { adminAgentVoteTools } from '../admin/agent-votes.mts'
import { adminModerationObservabilityTools } from '../admin/moderation-observability.mts'
import { adminLegalAnalyticsTools } from '../admin/legal-analytics.mts'
import { adminAppealsReadTools } from '../admin/appeals-reads.mts'
import { adminDisputesReadTools } from '../admin/disputes-reads.mts'
import { adminAppealsLifecycleTools } from '../admin/appeals-lifecycle.mts'
import { adminDisputesLifecycleTools } from '../admin/disputes-lifecycle.mts'
import { adminSiteOperationsTools } from '../admin/site-operations.mts'
import { resolveModerationAppealTool } from '../admin/appeals-resolution.mts'
import { resolveReviewDisputeTool } from '../admin/disputes-resolution.mts'
import addEntityRelationTool from '../add-entity-relation.mts'
import addListItemTool from '../add-list-item.mts'
import compareTopicsTool from '../compare-topics.mts'
import createListTool from '../create-list.mts'
import deleteListTool from '../delete-list.mts'
import getCommunityMembersTool from '../get-community-members.mts'
import getCommunityPinnedPostsTool from '../get-community-pinned-posts.mts'
import getCommunityPostsTool from '../get-community-posts.mts'
import getCommunityTool from '../get-community.mts'
import getDomainRatingsTool from '../get-domain-ratings.mts'
import getMyCardsTool from '../get-my-cards.mts'
import getMyPointValuationsTool from '../get-my-point-valuations.mts'
import getMyProfileTool from '../get-my-profile.mts'
import getMyFinancialProfileTool from '../get-my-financial-profile.mts'
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
import removeBookmarkTool from '../remove-bookmark.mts'
import removeListItemTool from '../remove-list-item.mts'
import searchCommunitiesTool from '../search-communities.mts'
import searchDataPointsTool from '../search-data-points.mts'
import searchPostsTool from '../search-posts.mts'
import searchRssFeedItemsTool from '../search-rss-feed-items.mts'
import searchTopicsTool from '../search-topics.mts'
import setBookmarkTool from '../set-bookmark.mts'
import updateListTool from '../update-list.mts'
import updateMyFinancialProfileTool from '../update-my-financial-profile.mts'
import type { Tool } from '@services/openai-agents/tool-types'

export const ALL_TOOLS: readonly Tool[] = [
  ...adminEditorialStoryTools,
  ...adminEditorialImportTools,
  ...adminEditorialCategoryTools,
  ...adminEditorialCrawlerTools,
  ...adminEditorialReadTools,
  ...adminReportTools,
  ...adminClearanceTools,
  ...adminTopicClaimTools,
  ...adminWarningTools,
  ...adminUserContextTools,
  ...adminAccountControlTools,
  ...adminReportIntegrityFlagTools,
  ...adminReportIntegrityPenaltyTools,
  ...adminVoteIntegrityFlagTools,
  ...adminVoteIntegrityPenaltyTools,
  ...adminAgentVoteTools,
  ...adminModerationObservabilityTools,
  ...adminLegalAnalyticsTools,
  ...adminAppealsReadTools,
  ...adminDisputesReadTools,
  ...adminAppealsLifecycleTools,
  ...adminDisputesLifecycleTools,
  ...adminSiteOperationsTools,
  resolveModerationAppealTool,
  resolveReviewDisputeTool,
  addEntityRelationTool,
  addListItemTool,
  compareTopicsTool,
  createListTool,
  deleteListTool,
  getCommunityMembersTool,
  getCommunityPinnedPostsTool,
  getCommunityPostsTool,
  getCommunityTool,
  getDomainRatingsTool,
  getMyCardsTool,
  getMyPointValuationsTool,
  getMyProfileTool,
  getMyFinancialProfileTool,
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
  removeBookmarkTool,
  removeListItemTool,
  searchCommunitiesTool,
  searchDataPointsTool,
  searchPostsTool,
  searchRssFeedItemsTool,
  searchTopicsTool,
  setBookmarkTool,
  updateListTool,
  updateMyFinancialProfileTool,
] as unknown as Tool[]

export function getRegisteredToolByName(name: string): Tool | undefined {
  return ALL_TOOLS.find(tool => tool.schema.name === name)
}
