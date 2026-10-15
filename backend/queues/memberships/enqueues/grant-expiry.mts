import { createBackgroundEnqueue } from '@queues/background/enqueues'
import { MEMBERSHIPS_GRANT_EXPIRY_JOB } from '@queues/background/enqueues/memberships-jobs-2'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { MEMBERSHIP_GRANT_EXPIRY_INTERVAL_MS } from '../config.mts'

const enqueueJob = createBackgroundEnqueue(MEMBERSHIPS_GRANT_EXPIRY_JOB)

export function enqueueExpireElapsedMemberships(): EnqueueReturnType {
  const jobId = `membership-grant-expiry__${Math.floor(Date.now() / MEMBERSHIP_GRANT_EXPIRY_INTERVAL_MS)}`
  return enqueueJob({}, {
    jobId,
    deduplication: {
      id: 'membership-grant-expiry',
      mode: 'throttle',
      ttl: MEMBERSHIP_GRANT_EXPIRY_INTERVAL_MS,
    },
  } satisfies Partial<JobOptions>)
}
