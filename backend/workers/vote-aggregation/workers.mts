import { processPagedDispatcher } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { background } from '@queues/background/queues'
import { enqueueUserElectionFanOut } from '@queues/vote-aggregation/enqueues/vote-weight'
import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import {
  VOTE_AGGREGATION_BACKFILL_REPORT_INTEGRITY_JOB,
  VOTE_AGGREGATION_RECALCULATE_USER_VOTE_WEIGHT_JOB,
  VOTE_AGGREGATION_REFRESH_POST_METRICS_JOB,
  VOTE_AGGREGATION_REFRESH_TOPIC_METRICS_JOB,
  VOTE_AGGREGATION_REFRESH_USER_METRICS_JOB,
  VOTE_AGGREGATION_REPORT_INTEGRITY_JOB,
  VOTE_AGGREGATION_TOPIC_RATING_STATS_JOB,
  VOTE_AGGREGATION_UPDATE_ELECTION_JOB,
  VOTE_AGGREGATION_USER_ELECTION_FAN_OUT_JOB,
  VOTE_AGGREGATION_VOTE_INTEGRITY_JOB,
  VOTE_AGGREGATION_VOTE_WEIGHT_DISPATCHER_JOB,
  VOTE_AGGREGATION_AGE_MILESTONES_JOB,
  VOTE_AGGREGATION_MEMBERSHIP_EXPIRATIONS_JOB,
  VOTE_AGGREGATION_FAMILY_SOURCE_CHANGES_JOB,
  VOTE_AGGREGATION_DIRTY_MARKERS_JOB,
} from '@queues/background/enqueues/vote-aggregation-jobs'
import { enqueueElectionUpdatePageForUser } from '@services/vote-weight/enqueue-election-updates'
import { processElection } from './processors/elections.mts'
import {
  processBackfillReportIntegrity,
  processReportIntegrityCheck,
} from './processors/report-integrity.mts'
import { processVoteIntegrityCheck } from './processors/vote-integrity.mts'
import {
  processRecalculateUserVoteWeight,
  processRecalculateVoteWeightDispatcher,
  processVoteWeightAgeMilestones,
  processVoteWeightMembershipExpirations,
  processVoteWeightFamilySourceChanges,
  processVoteWeightDirtyMarkers,
} from './processors/vote-weight.mts'
import {
  processRefreshPostMetrics,
  processRefreshTopicMetrics,
  processRefreshUserMetrics,
  processUpdateTopicRatingStats,
} from './processors.mts'

export const voteAggregationHandlers = [
  backgroundHandler(VOTE_AGGREGATION_UPDATE_ELECTION_JOB, processElection),
  backgroundHandler(VOTE_AGGREGATION_RECALCULATE_USER_VOTE_WEIGHT_JOB, job =>
    processRecalculateUserVoteWeight(job.data),
  ),
  backgroundHandler(VOTE_AGGREGATION_VOTE_WEIGHT_DISPATCHER_JOB, job =>
    processRecalculateVoteWeightDispatcher(job.data),
  ),
  backgroundHandler(VOTE_AGGREGATION_AGE_MILESTONES_JOB, job =>
    processVoteWeightAgeMilestones(job.data),
  ),
  backgroundHandler(VOTE_AGGREGATION_MEMBERSHIP_EXPIRATIONS_JOB, job =>
    processVoteWeightMembershipExpirations(job.data),
  ),
  backgroundHandler(VOTE_AGGREGATION_FAMILY_SOURCE_CHANGES_JOB, job =>
    processVoteWeightFamilySourceChanges(job.data),
  ),
  backgroundHandler(VOTE_AGGREGATION_DIRTY_MARKERS_JOB, job =>
    processVoteWeightDirtyMarkers(job.data),
  ),
  // One bounded page of the user's votes becomes election recomputes; a full page continues.
  backgroundHandler(VOTE_AGGREGATION_USER_ELECTION_FAN_OUT_JOB, job =>
    processPagedDispatcher(job, {
      dispatcher: 'elections',
      cursorKey: 'lane,id',
      target: background,
      targetName: 'background',
      readAndDispatch: async pageSize => {
        const result = await enqueueElectionUpdatePageForUser(
          job.data.userId,
          job.data.cursor,
          pageSize,
        )
        return {
          result,
          ...(result.nextCursor
            ? { next: { userId: job.data.userId, cursor: result.nextCursor } }
            : {}),
        }
      },
      enqueueNext: (data, options) => enqueueUserElectionFanOut(data.userId, data.cursor, options),
    }),
  ),
  backgroundHandler(VOTE_AGGREGATION_VOTE_INTEGRITY_JOB, job =>
    processVoteIntegrityCheck(job.data),
  ),
  backgroundHandler(VOTE_AGGREGATION_TOPIC_RATING_STATS_JOB, job =>
    processUpdateTopicRatingStats(job.data),
  ),
  backgroundHandler(VOTE_AGGREGATION_REFRESH_TOPIC_METRICS_JOB, job =>
    processRefreshTopicMetrics(job.data),
  ),
  backgroundHandler(VOTE_AGGREGATION_REFRESH_POST_METRICS_JOB, job =>
    processRefreshPostMetrics(job.data),
  ),
  backgroundHandler(VOTE_AGGREGATION_REFRESH_USER_METRICS_JOB, job =>
    processRefreshUserMetrics(job.data),
  ),
  backgroundHandler(VOTE_AGGREGATION_REPORT_INTEGRITY_JOB, job =>
    processReportIntegrityCheck(job.data),
  ),
  backgroundHandler(VOTE_AGGREGATION_BACKFILL_REPORT_INTEGRITY_JOB, job =>
    processBackfillReportIntegrity(job.data),
  ),
]
