import { backgroundDataHandler } from '@queues/background/enqueues/define-handler'
import { enqueueInvalidateCommunityMemberUserMetrics } from '@queues/background/enqueues/communities'
import { COMMUNITY_MEMBER_METRIC_INVALIDATION_JOB } from '@queues/background/enqueues/communities-jobs'
import { invalidateCommunityMemberUserMetricsPage } from '@services/communities/members/invalidate-user-metrics'

type EnqueuePage = typeof enqueueInvalidateCommunityMemberUserMetrics

export function createCommunitiesHandlers(enqueuePage: EnqueuePage) {
  return [
    backgroundDataHandler(COMMUNITY_MEMBER_METRIC_INVALIDATION_JOB, async data => {
      const result = await invalidateCommunityMemberUserMetricsPage(data)
      if (result.nextPageData) await enqueuePage(result.nextPageData)
      return result
    }),
  ]
}

export const communitiesHandlers = createCommunitiesHandlers(
  enqueueInvalidateCommunityMemberUserMetrics,
)
