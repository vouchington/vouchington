import type { EnqueueReturnType } from '@voucha/types'
import { createBackgroundEnqueue } from '@queues/background/enqueues'
import { VOTE_AGGREGATION_VOTE_INTEGRITY_JOB } from '@queues/background/enqueues/vote-aggregation-jobs'
import { VOTE_INTEGRITY_DEDUPLICATION_TTL_MS } from './config-vote-integrity.mts'

const enqueueVoteIntegrityCheckJob = createBackgroundEnqueue(VOTE_AGGREGATION_VOTE_INTEGRITY_JOB)

export function enqueueVoteIntegrityCheck(
  entityType: string,
  entityId: string,
  userId: string,
  ipAddress: string | null,
  score: number,
): EnqueueReturnType {
  return enqueueVoteIntegrityCheckJob(
    { entityType, entityId, userId, ipAddress, score },
    {
      deduplication: {
        id: `processVoteIntegrityCheck__${entityType}__${entityId}`,
        mode: 'debounce',
        ttl: VOTE_INTEGRITY_DEDUPLICATION_TTL_MS,
      },
    },
  )
}
