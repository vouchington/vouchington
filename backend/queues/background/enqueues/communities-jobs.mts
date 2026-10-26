import { PRIORITY_DISPATCH } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

export type InvalidateCommunityMemberUserMetricsData = {
  communityId: string
  generation: string
  minimumReplayLsn: string
  upperBoundMembershipId: string
  afterMembershipId?: string
}

export const COMMUNITIES_DOMAIN = defineBackgroundDomain({
  domain: 'communities',
  workerConcurrency: 1,
})

export const COMMUNITY_MEMBER_METRIC_INVALIDATION_JOB =
  defineBackgroundJob<InvalidateCommunityMemberUserMetricsData>(COMMUNITIES_DOMAIN, {
    name: 'invalidateMemberUserMetrics',
    priority: PRIORITY_DISPATCH,
    ordering: { key: 'communities:member-metric-invalidation' },
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
    removeOnComplete: 1000,
    removeOnFail: 1000,
  })

export const COMMUNITIES_JOBS = [COMMUNITY_MEMBER_METRIC_INVALIDATION_JOB] as const
