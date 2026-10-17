import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import {
  FOLLOWER_DISTRIBUTIONS_BACKFILL_JOB,
  FOLLOWER_DISTRIBUTIONS_PROCESS_JOB,
} from '@queues/background/enqueues/follower-distributions-jobs'
import * as processors from './processors.mts'

export const followerDistributionsHandlers = [
  backgroundHandler(FOLLOWER_DISTRIBUTIONS_PROCESS_JOB, processors.processFollowerDistribution),
  backgroundHandler(FOLLOWER_DISTRIBUTIONS_BACKFILL_JOB, job =>
    processors.backfillFollowerDistributions(job.data.afterId),
  ),
]
