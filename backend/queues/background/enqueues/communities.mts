import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { createBackgroundBulkEnqueue } from '../enqueues.mts'
import { background } from '../queues.mts'
import {
  COMMUNITY_MEMBER_METRIC_INVALIDATION_JOB,
  type InvalidateCommunityMemberUserMetricsData,
} from './communities-jobs.mts'

const enqueueBulk = createBackgroundBulkEnqueue(
  COMMUNITY_MEMBER_METRIC_INVALIDATION_JOB,
  (data: InvalidateCommunityMemberUserMetricsData) => ({
    data,
    opts: { jobId: communityMemberMetricInvalidationJobId(data) },
  }),
)

export async function enqueueInvalidateCommunityMemberUserMetrics(
  data: InvalidateCommunityMemberUserMetricsData,
): Promise<unknown> {
  return enqueueBulkReactivatingFinished({
    queue: background,
    inputs: [data],
    jobIdOf: communityMemberMetricInvalidationJobId,
    enqueueBulk,
  })
}

export function communityMemberMetricInvalidationJobId(
  data: InvalidateCommunityMemberUserMetricsData,
): string {
  return [
    COMMUNITY_MEMBER_METRIC_INVALIDATION_JOB.name,
    data.communityId,
    data.generation,
    data.afterMembershipId ?? 'root',
  ].join('__')
}
