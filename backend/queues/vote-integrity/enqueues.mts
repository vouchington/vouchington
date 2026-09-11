import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { PRIORITY_DEFAULT, QUEUE_NAME, VOTE_INTEGRITY_DEDUPLICATION_TTL_MS } from './config.mts'
import { voteIntegrityQueue } from './queues.mts'
import type { ProcessVoteIntegrityCheckData, VoteIntegrityJobs } from './types.mts'

const JOB_NAME: VoteIntegrityJobs = 'processVoteIntegrityCheck'

const enqueueVoteIntegrityCheckJob = createEnqueueFunction<
  ProcessVoteIntegrityCheckData,
  VoteIntegrityJobs
>({
  queue: voteIntegrityQueue,
  queueName: QUEUE_NAME,
  jobName: JOB_NAME,
})

export function enqueueVoteIntegrityCheck(
  entityType: string,
  entityId: string,
  userId: string,
  ipAddress: string | null,
  score: number,
): EnqueueReturnType {
  return enqueueVoteIntegrityCheckJob({ entityType, entityId, userId, ipAddress, score }, {
    priority: PRIORITY_DEFAULT,
    deduplication: {
      id: `processVoteIntegrityCheck__${entityType}__${entityId}`,
      mode: 'debounce',
      ttl: VOTE_INTEGRITY_DEDUPLICATION_TTL_MS,
    },
  } satisfies Partial<JobOptions>)
}
