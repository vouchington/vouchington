import { assertDispatchWorkPlan } from './plan-custom/dispatch-work.mts'
import { assertMediaDeliveryReplayPlan } from './plan-custom/media-delivery-replay.mts'
import type { ExplainResult } from '@data-stores/psql'
import { assertAdminEmailIndexPlan } from './plan-custom/admin-email.mts'
import { assertClassifierHumanVoteComparisonPlanIfApplicable } from './plan-custom/classifier-human-vote-comparison.mts'
import { assertCopyrightStatementFactsIsTargetBounded } from './plan-custom/copyright-statement-facts.mts'
import { assertEmbeddingReconciliationPlanIfApplicable } from './plan-custom/embedding-reconciliation.mts'
import { assertPaginationPlanShape } from './plan-custom/pagination-gates.mts'
import { assertPostShareEligibilityIsTargetBounded } from './plan-custom/post-share-targets.mts'
import { assertRemoteFollowerPagePlanShapeIfApplicable } from './plan-custom/remote-followers.mts'
import { assertReviewSuccessionCandidatePlanIfApplicable } from './plan-custom/review-succession.mts'
import { assertRssFeedCandidatesAreSetBased } from './plan-custom/rss-feed-candidates.mts'
import { assertRssRecencyLateCursorPlan } from './plan-custom/rss-recency-cursor.mts'
import {
  assertSearchCommunitiesEligibilityIsIndexed,
  assertSearchCommunityMemberCandidates,
} from './plan-custom/search-communities.mts'
import { assertSemanticPostCandidatePlan } from './plan-custom/semantic-post.mts'
import { assertStoryMemberPagePlan } from './plan-custom/story-member-pages.mts'
import { assertTopicViewerCountsDiscussionsUsesCandidateBind } from './plan-custom/topic-viewer-counts.mts'
import { assertTrendingCommunitiesIsCandidateBounded } from './plan-custom/trending-communities.mts'
import { assertCorePlanCheck } from './plan-custom/core-special.mts'
import { assertUsernamePrefixCandidates } from './plan-custom/username-prefix.mts'

const customChecks: Readonly<Record<string, (result: ExplainResult) => void>> = {
  dispatchUrlSelectivity: result => assertDispatchWorkPlan('urls', result),
  dispatchReferralCrawlSelectivity: result => assertDispatchWorkPlan('crawl', result),
  dispatchReferralUnfurlSelectivity: result => assertDispatchWorkPlan('unfurl', result),
  mediaDeliveryReplay: assertMediaDeliveryReplayPlan,
  adminEmail: assertAdminEmailIndexPlan,
  classifierBatch: assertClassifierHumanVoteComparisonPlanIfApplicable,
  copyrightFacts: assertCopyrightStatementFactsIsTargetBounded,
  embeddingFirstPost: assertEmbeddingReconciliationPlanIfApplicable,
  paginationSpecial: assertPaginationPlanShape,
  postShareTargets: assertPostShareEligibilityIsTargetBounded,
  remoteFollowers: assertRemoteFollowerPagePlanShapeIfApplicable,
  reviewSuccession: assertReviewSuccessionCandidatePlanIfApplicable,
  rssFeedCandidates: assertRssFeedCandidatesAreSetBased,
  rssRecencyCursor: assertRssRecencyLateCursorPlan,
  searchCommunitiesEligibility: assertSearchCommunitiesEligibilityIsIndexed,
  searchCommunityMemberCandidates: assertSearchCommunityMemberCandidates,
  semanticPost: assertSemanticPostCandidatePlan,
  storyMemberPages: assertStoryMemberPagePlan,
  topicViewerCandidateBind: assertTopicViewerCountsDiscussionsUsesCandidateBind,
  trendingCommunities: assertTrendingCommunitiesIsCandidateBounded,
  universalTopicCandidates: result => assertCorePlanCheck('universalTopicCandidates', result),
  rssStateProjection: result => assertCorePlanCheck('rssStateProjection', result),
  rssTextCandidates: result => assertCorePlanCheck('rssTextCandidates', result),
  communityTextCandidates: result => assertCorePlanCheck('communityTextCandidates', result),
  usernamePrefixCandidates: assertUsernamePrefixCandidates,
  relationListingOrder: result => assertCorePlanCheck('relationListingOrder', result),
  entityRelationVotes: result => assertCorePlanCheck('entityRelationVotes', result),
  userRemovedPosts: result => assertCorePlanCheck('userRemovedPosts', result),
  topicImportAttempts: result => assertCorePlanCheck('topicImportAttempts', result),
}

export function assertCustomPlanCheck(name: string, result: ExplainResult): void {
  const check = customChecks[name]
  if (!check) throw new Error(`Unknown custom plan check: ${name}`)
  check(result)
}

export function isKnownCustomPlanCheck(name: string): boolean {
  return name in customChecks
}
