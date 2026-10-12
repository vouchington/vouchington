import applyToCommunityTool from '../apply-to-community.mts'
import createCommunityTool from '../create-community.mts'
import createContentReportTool from '../create-content-report.mts'
import createModerationAppealTool from '../create-moderation-appeal.mts'
import createReviewDisputeTool from '../create-review-dispute.mts'
import joinCommunityTool from '../join-community.mts'
import leaveCommunityTool from '../leave-community.mts'

/** Communities, user content reports, review disputes and moderation appeals the owner files. */
export const communityReportAppealWriteTools = [
  createCommunityTool,
  joinCommunityTool,
  leaveCommunityTool,
  applyToCommunityTool,
  createContentReportTool,
  createReviewDisputeTool,
  createModerationAppealTool,
]
