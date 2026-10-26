import { enqueueInvalidateCommunityMemberUserMetrics } from '@queues/background/enqueues/communities'
import { createCommunitiesHandlers } from './communities-handler-factory.mts'

export const communitiesHandlers = createCommunitiesHandlers(
  enqueueInvalidateCommunityMemberUserMetrics,
)
