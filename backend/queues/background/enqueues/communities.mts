import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { background } from '../queues.mts'
import {
  COMMUNITY_MEMBER_METRIC_INVALIDATION_JOB,
  type InvalidateCommunityMemberUserMetricsData,
} from './communities-jobs.mts'

const enqueueBulk = createBulkEnqueueFunction({
  queue: background,
  queueName: background.name,
  jobName: COMMUNITY_MEMBER_METRIC_INVALIDATION_JOB.name,
  defaults: COMMUNITY_MEMBER_METRIC_INVALIDATION_JOB.options,
  buildJob: (data: InvalidateCommunityMemberUserMetricsData) => ({
    data,
    opts: { jobId: communityMemberMetricInvalidationJobId(data) },
  }),
})

export function enqueueInvalidateCommunityMemberUserMetrics(
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
