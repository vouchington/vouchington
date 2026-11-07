import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { MEMBERSHIP_GRANT_EXPIRY_INTERVAL_MS, PRIORITY_DISPATCHER } from '../config.mts'
import type { MembershipsJobs } from '../types.mts'
import { createMembershipEnqueueFunction } from './typed-job.mts'

const JOB_NAME = 'expireElapsedMemberships' satisfies MembershipsJobs

const enqueueJob = createMembershipEnqueueFunction(JOB_NAME, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
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
