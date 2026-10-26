import { backgroundDataHandler } from '@queues/background/enqueues/define-handler'
import { COMMUNITY_MEMBER_METRIC_INVALIDATION_JOB } from '@queues/background/enqueues/communities-jobs'
import { invalidateCommunityMemberUserMetricsPage } from '@services/communities/members/invalidate-user-metrics'

export const communitiesHandlers = [
  backgroundDataHandler(
    COMMUNITY_MEMBER_METRIC_INVALIDATION_JOB,
    invalidateCommunityMemberUserMetricsPage,
  ),
]
