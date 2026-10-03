import createTopicRecommendationTool from '../create-topic-recommendation.mts'
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
import activateReferralLinkTool from '../activate-referral-link.mts'
import addListItemTool from '../add-list-item.mts'
import addMyProfileLinkTool from '../add-my-profile-link.mts'
import compareTopicsTool from '../compare-topics.mts'
import createListTool from '../create-list.mts'
import createReferralLinkTool from '../create-referral-link.mts'
import deleteListTool from '../delete-list.mts'
import deactivateReferralLinkTool from '../deactivate-referral-link.mts'
import deleteMyProfileLinkTool from '../delete-my-profile-link.mts'
import deleteNotificationTool from '../delete-notification.mts'
import deleteReferralLinkTool from '../delete-referral-link.mts'
import getCommunityMembersTool from '../get-community-members.mts'
import getCommunityPinnedPostsTool from '../get-community-pinned-posts.mts'
import getCommunityPostsTool from '../get-community-posts.mts'
import getCommunityTool from '../get-community.mts'
import getDomainRatingsTool from '../get-domain-ratings.mts'
import getListItemsTool from '../get-list-items.mts'
import getListTool from '../get-list.mts'
import getMyCardsTool from '../get-my-cards.mts'
import getMyPointValuationsTool from '../get-my-point-valuations.mts'
import getMyProfileTool from '../get-my-profile.mts'
import getMyFinancialProfileTool from '../get-my-financial-profile.mts'
import getMyListsTool from '../get-my-lists.mts'
import getMyRewardsStatusesTool from '../get-my-rewards-statuses.mts'
import getMySpendingTool from '../get-my-spending.mts'
import getPostAncestorsTool from '../get-post-ancestors.mts'
import getPostDescendantsTool from '../get-post-descendants.mts'
import getPostTool from '../get-post.mts'
import getRecommendedTopicsTool from '../get-recommended-topics.mts'
import getReferralLinksTool from '../get-referral-links.mts'
import getStoryTool from '../get-story.mts'
import getTopHostnamesTool from '../get-top-hostnames.mts'
import getTopicDetailsTool from '../get-topic-details.mts'
import getTopicInsightsTool from '../get-topic-insights.mts'
import getTopicMetricsTool from '../get-topic-metrics.mts'
import getTrendingPostsTool from '../get-trending-posts.mts'
import getTrendingTopicsTool from '../get-trending-topics.mts'
import getUserTool from '../get-user.mts'
import manageMyCardsTool from '../manage-my-cards.mts'
import manageMyPointValuationsTool from '../manage-my-point-valuations.mts'
import manageMyRewardsStatusesTool from '../manage-my-rewards-statuses.mts'
import manageMySpendingTool from '../manage-my-spending.mts'
import markAllNotificationsReadTool from '../mark-all-notifications-read.mts'
import markNotificationReadTool from '../mark-notification-read.mts'
import removeBookmarkTool from '../remove-bookmark.mts'
import removeListItemTool from '../remove-list-item.mts'
import reorderMyProfileLinksTool from '../reorder-my-profile-links.mts'
import requestReferralLinkUnfurlTool from '../request-referral-link-unfurl.mts'
import searchCommunitiesTool from '../search-communities.mts'
import searchDataPointsTool from '../search-data-points.mts'
import searchHostnamesTool from '../search-hostnames.mts'
import searchPostsTool from '../search-posts.mts'
import searchRssFeedItemsTool from '../search-rss-feed-items.mts'
import searchTopicsTool from '../search-topics.mts'
import searchUsersTool from '../search-users.mts'
import setBookmarkTool from '../set-bookmark.mts'
import updateListTool from '../update-list.mts'
import updateMyBioTool from '../update-my-bio.mts'
import updateMyDisplayIdentityTool from '../update-my-display-identity.mts'
import updateMyEmailPreferencesTool from '../update-my-email-preferences.mts'
import updateMyFinancialProfileTool from '../update-my-financial-profile.mts'
import updateMyPreferencesTool from '../update-my-preferences.mts'
import updateMyProfileLinkTool from '../update-my-profile-link.mts'
import updateReferralLinkTool from '../update-referral-link.mts'
import updateTopicRecommendationTool from '../update-topic-recommendation.mts'
import withdrawTopicRecommendationTool from '../withdraw-topic-recommendation.mts'
import type { Tool } from '@services/openai-agents/tool-types'
import { communityListMembershipReadTools } from './community-list-membership-read-tools.mts'
import { entityRelationWriteTools } from './entity-relation-write-tools.mts'
import { ownDataReadTools } from './own-data-read-tools.mts'
import { searchReferenceReadTools } from './search-reference-read-tools.mts'

export const ALL_TOOLS: readonly Tool[] = [
  createTopicRecommendationTool,
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
  ...communityListMembershipReadTools,
  ...entityRelationWriteTools,
  ...ownDataReadTools,
  ...searchReferenceReadTools,
  resolveModerationAppealTool,
  resolveReviewDisputeTool,
  activateReferralLinkTool,
  addListItemTool,
  addMyProfileLinkTool,
  compareTopicsTool,
  createListTool,
  createReferralLinkTool,
  deleteListTool,
  deactivateReferralLinkTool,
  deleteMyProfileLinkTool,
  deleteNotificationTool,
  deleteReferralLinkTool,
  getCommunityMembersTool,
  getCommunityPinnedPostsTool,
  getCommunityPostsTool,
  getCommunityTool,
  getDomainRatingsTool,
  getListItemsTool,
  getListTool,
  getMyCardsTool,
  getMyPointValuationsTool,
  getMyProfileTool,
  getMyFinancialProfileTool,
  getMyListsTool,
  getMyRewardsStatusesTool,
  getMySpendingTool,
  getPostAncestorsTool,
  getPostDescendantsTool,
  getPostTool,
  getRecommendedTopicsTool,
  getReferralLinksTool,
  getStoryTool,
  getTopHostnamesTool,
  getTopicDetailsTool,
  getTopicInsightsTool,
  getTopicMetricsTool,
  getTrendingPostsTool,
  getTrendingTopicsTool,
  getUserTool,
  manageMyCardsTool,
  manageMyPointValuationsTool,
  manageMyRewardsStatusesTool,
  manageMySpendingTool,
  markAllNotificationsReadTool,
  markNotificationReadTool,
  removeBookmarkTool,
  removeListItemTool,
  reorderMyProfileLinksTool,
  requestReferralLinkUnfurlTool,
  searchCommunitiesTool,
  searchDataPointsTool,
  searchHostnamesTool,
  searchPostsTool,
  searchRssFeedItemsTool,
  searchTopicsTool,
  searchUsersTool,
  setBookmarkTool,
  updateListTool,
  updateMyBioTool,
  updateMyDisplayIdentityTool,
  updateMyEmailPreferencesTool,
  updateMyFinancialProfileTool,
  updateMyPreferencesTool,
  updateMyProfileLinkTool,
  updateReferralLinkTool,
  updateTopicRecommendationTool,
  withdrawTopicRecommendationTool,
] as unknown as Tool[]

export function getRegisteredToolByName(name: string): Tool | undefined {
  return ALL_TOOLS.find(tool => tool.schema.name === name)
}
