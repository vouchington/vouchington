import type { EnqueueReturnType } from '@voucha/types'
import { createBackgroundEnqueue } from '@queues/background/enqueues'
import { VOTE_AGGREGATION_VOTE_INTEGRITY_JOB } from '@queues/background/enqueues/vote-aggregation-jobs'

const enqueueVoteIntegrityCheckJob = createBackgroundEnqueue(VOTE_AGGREGATION_VOTE_INTEGRITY_JOB)

export function enqueueVoteIntegrityCheck(
  entityType: string,
  entityId: string,
  userId: string,
  score: number,
  voteId: string,
): EnqueueReturnType {
  return enqueueVoteIntegrityCheckJob(
    { entityType, entityId, userId, score, voteId },
    {
      deduplication: {
        id: `processVoteIntegrityCheck__${voteId}`,
        mode: 'simple',
      },
    },
  )
}
