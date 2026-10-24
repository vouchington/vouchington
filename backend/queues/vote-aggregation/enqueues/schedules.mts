import { ENQUEUE_BASE_DEFAULTS } from '@data-stores/valkey-glide-mq'
import { defineScheduledJobManifest } from '@modules/scheduled-job-manifest'
import { toSchedulerTemplateOptions } from '@vouchington/worker-runtime/schedule-manifest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import {
  VOTE_AGGREGATION_AGE_MILESTONES_JOB,
  VOTE_AGGREGATION_MEMBERSHIP_EXPIRATIONS_JOB,
  VOTE_AGGREGATION_FAMILY_SOURCE_CHANGES_JOB,
  VOTE_AGGREGATION_DIRTY_MARKERS_JOB,
} from '@queues/background/enqueues/vote-aggregation-jobs'
import {
  enqueueVoteWeightAgeMilestones,
  enqueueVoteWeightMembershipExpirations,
  enqueueVoteWeightFamilySourceChanges,
  enqueueVoteWeightDirtyMarkers,
} from './vote-weight.mts'

const DISPATCHERS = [
  {
    id: 'voteWeightDirtyMarkers',
    backfillId: 'vote-weight-dirty-markers',
    description: 'Recover vote-weight recalculation dirty markers',
    job: VOTE_AGGREGATION_DIRTY_MARKERS_JOB,
    trigger: () => enqueueVoteWeightDirtyMarkers({}),
  },
  {
    id: 'voteWeightAgeMilestones',
    backfillId: 'vote-weight-age-milestones',
    description: 'Dispatch vote-weight age milestones',
    job: VOTE_AGGREGATION_AGE_MILESTONES_JOB,
    trigger: enqueueVoteWeightAgeMilestones,
  },
  {
    id: 'voteWeightMembershipExpirations',
    backfillId: 'vote-weight-membership-expirations',
    description: 'Dispatch expired memberships for vote weights',
    job: VOTE_AGGREGATION_MEMBERSHIP_EXPIRATIONS_JOB,
    trigger: enqueueVoteWeightMembershipExpirations,
  },
  {
    id: 'voteWeightFamilySourceChanges',
    backfillId: 'vote-weight-family-source-changes',
    description: 'Dispatch family source changes for vote weights',
    job: VOTE_AGGREGATION_FAMILY_SOURCE_CHANGES_JOB,
    trigger: enqueueVoteWeightFamilySourceChanges,
  },
] as const

export const scheduledJobManifest = defineScheduledJobManifest(
  BACKGROUND_QUEUE_NAME,
  DISPATCHERS.map(({ id, backfillId, description, job, trigger }) => ({
    schedulerId: id,
    repeat: { pattern: '0 4 * * *' },
    template: {
      name: job.name,
      opts: toSchedulerTemplateOptions({ ...ENQUEUE_BASE_DEFAULTS, ...job.options }),
    },
    operatorSurfaces: [
      { kind: 'scheduled-jobs' as const, id, schedule: '0 4 * * *', description, trigger },
      { kind: 'backfill' as const, backfillId },
    ],
  })),
)
