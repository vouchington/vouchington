import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { MEMBERSHIP_GRANT_EXPIRY_INTERVAL_MS, PRIORITY_DISPATCHER, QUEUE_NAME } from '../config.mts'
import { memberships } from '../queues.mts'
import type { MembershipsJobs } from '../types.mts'

const JOB_NAME: MembershipsJobs = 'expireElapsedMemberships'

const enqueueJob = createEnqueueFunction<Record<string, never>, MembershipsJobs>({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: JOB_NAME,
  defaults: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
})

export function enqueueExpireElapsedMemberships(): EnqueueReturnType {
  const jobId = `membership-grant-expiry__${Math.floor(Date.now() / MEMBERSHIP_GRANT_EXPIRY_INTERVAL_MS)}`
  return enqueueJob({}, {
    jobId,
    priority: PRIORITY_DISPATCHER,
    deduplication: {
      id: 'membership-grant-expiry',
      mode: 'throttle',
      ttl: MEMBERSHIP_GRANT_EXPIRY_INTERVAL_MS,
    },
  } satisfies Partial<JobOptions>)
}
