import type {
  VoteWeightAgeMilestonesData,
  VoteWeightMembershipExpirationsData,
  VoteWeightFamilySourceChangesData,
} from './vote-weight-dispatch-types.mts'
import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// The old queue's cap was its worker concurrency of 10. Election jobs also carried one ordering key
// per lane they recompute, but each allowed 100 in flight, so the lanes were fairness and never
// exclusivity. One domain-wide group of 10 keeps the cap and replaces the lane keys.
export const VOTE_AGGREGATION_DOMAIN = defineBackgroundDomain({
  domain: 'vote-aggregation',
  group: { kind: 'domain', concurrency: 10, deferral: 'job' },
  workerConcurrency: 10,
})

export const ELECTION_LANES = [
  'topic',
  'hostname',
  'agent_moderation',
  'post',
  'entity_relation',
  'rss_feed_item',
  'user_vouch',
] as const
export type ElectionLane = (typeof ELECTION_LANES)[number]

export type ElectionJobData =
  | {
      electionId: string
      orderingKey: Exclude<ElectionLane, 'entity_relation'>
      relationTable?: never
    }
  | { electionId: string; orderingKey: 'entity_relation'; relationTable: string }

/** Last ballot cursor: base lanes use target ids; concrete relation lanes use event ids. */
export type UserElectionFanOutCursor = { lane: number; afterId: string }
export type UserElectionFanOutData = { userId: string; cursor: UserElectionFanOutCursor | null }

const BACKOFF = { type: 'exponential', delay: 1000 } as const
const JITTERED_BACKOFF = { ...BACKOFF, jitter: 0.5 } as const

export const VOTE_AGGREGATION_UPDATE_ELECTION_JOB = defineBackgroundJob<ElectionJobData>(
  VOTE_AGGREGATION_DOMAIN,
  {
    name: 'processUpdateElectionVoteStats',
    priority: PRIORITY_TASK,
    attempts: 3,
    backoff: JITTERED_BACKOFF,
    removeOnComplete: 100,
    removeOnFail: 100,
  },
)
export const VOTE_AGGREGATION_RECALCULATE_USER_VOTE_WEIGHT_JOB = defineBackgroundJob<{
  userId: string
  forceRecalculate?: boolean
  replayElectionsOnly?: boolean
}>(VOTE_AGGREGATION_DOMAIN, { name: 'processRecalculateUserVoteWeight', priority: PRIORITY_TASK })
export const VOTE_AGGREGATION_VOTE_WEIGHT_DISPATCHER_JOB = defineBackgroundJob<{
  afterId?: string | null
  replayElectionsOnly?: boolean
}>(VOTE_AGGREGATION_DOMAIN, {
  name: 'processRecalculateVoteWeightDispatcher',
  priority: PRIORITY_DISPATCH,
  attempts: 3,
  backoff: JITTERED_BACKOFF,
  removeOnComplete: 100,
  removeOnFail: 100,
})
const VOTE_WEIGHT_DISPATCH_OPTIONS = {
  priority: PRIORITY_DISPATCH,
  attempts: 3,
  backoff: BACKOFF,
  removeOnComplete: 100,
  removeOnFail: 100,
} as const
export const VOTE_AGGREGATION_AGE_MILESTONES_JOB = defineBackgroundJob<VoteWeightAgeMilestonesData>(
  VOTE_AGGREGATION_DOMAIN,
  {
    name: 'processVoteWeightAgeMilestones',
    ...VOTE_WEIGHT_DISPATCH_OPTIONS,
  },
)
export const VOTE_AGGREGATION_MEMBERSHIP_EXPIRATIONS_JOB =
  defineBackgroundJob<VoteWeightMembershipExpirationsData>(VOTE_AGGREGATION_DOMAIN, {
    name: 'processVoteWeightMembershipExpirations',
    ...VOTE_WEIGHT_DISPATCH_OPTIONS,
  })
export const VOTE_AGGREGATION_FAMILY_SOURCE_CHANGES_JOB =
  defineBackgroundJob<VoteWeightFamilySourceChangesData>(VOTE_AGGREGATION_DOMAIN, {
    name: 'processVoteWeightFamilySourceChanges',
    ...VOTE_WEIGHT_DISPATCH_OPTIONS,
  })
/** One bounded page of a user's votes becomes election recomputes, then continues from its cursor. */
export const VOTE_AGGREGATION_USER_ELECTION_FAN_OUT_JOB =
  defineBackgroundJob<UserElectionFanOutData>(VOTE_AGGREGATION_DOMAIN, {
    name: 'enqueueUserElectionUpdates',
    priority: PRIORITY_DISPATCH,
    removeOnComplete: true,
    removeOnFail: true,
  })
export const VOTE_AGGREGATION_VOTE_INTEGRITY_JOB = defineBackgroundJob<{
  entityType: string
  entityId: string
  userId: string
  ipAddress: string | null
  score: number
}>(VOTE_AGGREGATION_DOMAIN, { name: 'processVoteIntegrityCheck', priority: PRIORITY_TASK })
export const VOTE_AGGREGATION_TOPIC_RATING_STATS_JOB = defineBackgroundJob<{ topicId: string }>(
  VOTE_AGGREGATION_DOMAIN,
  { name: 'processUpdateTopicRatingStats', priority: PRIORITY_TASK },
)

const refreshJob = (name: string) =>
  defineBackgroundJob<{ id: string }>(VOTE_AGGREGATION_DOMAIN, { name, priority: PRIORITY_TASK })
export const VOTE_AGGREGATION_REFRESH_TOPIC_METRICS_JOB = refreshJob('processRefreshTopicMetrics')
export const VOTE_AGGREGATION_REFRESH_POST_METRICS_JOB = refreshJob('processRefreshPostMetrics')
export const VOTE_AGGREGATION_REFRESH_USER_METRICS_JOB = refreshJob('processRefreshUserMetrics')

export const VOTE_AGGREGATION_REPORT_INTEGRITY_JOB = defineBackgroundJob<{
  entityType: string
  entityId: string
}>(VOTE_AGGREGATION_DOMAIN, {
  name: 'processReportIntegrityCheck',
  priority: PRIORITY_TASK,
  attempts: 3,
  backoff: BACKOFF,
  removeOnComplete: 100,
  removeOnFail: 100,
})
/** Re-enqueues one bounded page of integrity checks after `afterId`, then continues from its last id. */
export const VOTE_AGGREGATION_BACKFILL_REPORT_INTEGRITY_JOB = defineBackgroundJob<{
  afterId?: string
}>(VOTE_AGGREGATION_DOMAIN, { name: 'backfill_report_integrity', priority: PRIORITY_DISPATCH })

export const VOTE_AGGREGATION_JOBS = [
  VOTE_AGGREGATION_UPDATE_ELECTION_JOB,
  VOTE_AGGREGATION_RECALCULATE_USER_VOTE_WEIGHT_JOB,
  VOTE_AGGREGATION_VOTE_WEIGHT_DISPATCHER_JOB,
  VOTE_AGGREGATION_AGE_MILESTONES_JOB,
  VOTE_AGGREGATION_MEMBERSHIP_EXPIRATIONS_JOB,
  VOTE_AGGREGATION_FAMILY_SOURCE_CHANGES_JOB,
  VOTE_AGGREGATION_USER_ELECTION_FAN_OUT_JOB,
  VOTE_AGGREGATION_VOTE_INTEGRITY_JOB,
  VOTE_AGGREGATION_TOPIC_RATING_STATS_JOB,
  VOTE_AGGREGATION_REFRESH_TOPIC_METRICS_JOB,
  VOTE_AGGREGATION_REFRESH_POST_METRICS_JOB,
  VOTE_AGGREGATION_REFRESH_USER_METRICS_JOB,
  VOTE_AGGREGATION_REPORT_INTEGRITY_JOB,
  VOTE_AGGREGATION_BACKFILL_REPORT_INTEGRITY_JOB,
] as const
