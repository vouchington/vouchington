import { createBulkEnqueueFunction, type PriorityQueue } from '@data-stores/valkey-glide-mq'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { background } from '../queues.mts'
import {
  COMMUNITY_MEMBER_METRIC_INVALIDATION_JOB,
  type InvalidateCommunityMemberUserMetricsData,
} from './communities-jobs.mts'

export function createCommunityMemberMetricEnqueue(queue: PriorityQueue<unknown>) {
  const enqueueBulk = createBulkEnqueueFunction({
    queue,
    queueName: queue.name,
    jobName: COMMUNITY_MEMBER_METRIC_INVALIDATION_JOB.name,
    defaults: COMMUNITY_MEMBER_METRIC_INVALIDATION_JOB.options,
    buildJob: (data: InvalidateCommunityMemberUserMetricsData) => ({
      data,
      opts: { jobId: communityMemberMetricInvalidationJobId(data) },
    }),
  })
  return (data: InvalidateCommunityMemberUserMetricsData): Promise<unknown> =>
    enqueueBulkReactivatingFinished({
      queue,
      inputs: [data],
      jobIdOf: communityMemberMetricInvalidationJobId,
      enqueueBulk,
    })
}

export const enqueueInvalidateCommunityMemberUserMetrics =
  createCommunityMemberMetricEnqueue(background)

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
