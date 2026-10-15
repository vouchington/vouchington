import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  MEMBERSHIPS_RECOVER_VERIFICATIONS_JOB,
  MEMBERSHIPS_VERIFICATION_JOB,
} from '@queues/background/enqueues/memberships-jobs-2'
import type { ProcessMembershipVerificationData } from '@queues/background/enqueues/memberships-domain'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'

const VERIFICATION_RECOVERY_INTERVAL_MS = 300_000

const enqueueProcessMembershipVerificationJob = createBackgroundEnqueue(
  MEMBERSHIPS_VERIFICATION_JOB,
)

export const enqueueBulkProcessMembershipVerifications = createBackgroundBulkEnqueue(
  MEMBERSHIPS_VERIFICATION_JOB,
  (data: ProcessMembershipVerificationData) => ({ data, opts: verificationJobOptions(data) }),
)

const enqueueRecoverMembershipVerificationsJob = createBackgroundEnqueue(
  MEMBERSHIPS_RECOVER_VERIFICATIONS_JOB,
)

export function enqueueProcessMembershipVerification(
  data: ProcessMembershipVerificationData,
): EnqueueReturnType {
  return enqueueProcessMembershipVerificationJob(data, verificationJobOptions(data))
}

export function enqueueRecoverMembershipVerifications(): EnqueueReturnType {
  const jobId = `membership-verification-recovery__${Math.floor(Date.now() / VERIFICATION_RECOVERY_INTERVAL_MS)}`
  return enqueueRecoverMembershipVerificationsJob({}, {
    jobId,
    deduplication: {
      id: 'membership-verification-recovery',
      mode: 'throttle',
      ttl: VERIFICATION_RECOVERY_INTERVAL_MS,
    },
  } satisfies Partial<JobOptions>)
}

function verificationJobOptions(data: ProcessMembershipVerificationData): Partial<JobOptions> {
  const jobId = `membership-verification__${data.verificationId}`
  return { jobId, deduplication: { id: jobId, mode: 'simple' } }
}
