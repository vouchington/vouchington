import { registerRecommendationApprovedHandler } from '@services/wikipedia-topic-recommendations/recommendation-approved-handler-registry'
import { autoFollowOnRecommendationApproval } from './auto-follow-on-approval.mts'

// Registers this package's auto-follow logic as wikipedia-topic-recommendations' recommendation-
// approved handler, as a side effect of importing this module (see
// backend/services/user-import-export/index.mts, which imports this first for its side effects).
// Keeps wikipedia-topic-recommendations from depending on user-import-export.
registerRecommendationApprovedHandler(autoFollowOnRecommendationApproval)
