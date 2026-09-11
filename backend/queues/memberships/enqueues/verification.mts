import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { PRIORITY_DEFAULT, PRIORITY_DISPATCHER, QUEUE_NAME } from '../config.mts'
import { memberships } from '../queues.mts'
import type { MembershipsJobs, ProcessMembershipVerificationData } from '../types.mts'

const VERIFICATION_JOB_NAME: MembershipsJobs = 'processMembershipVerification'
const VERIFICATION_RECOVERY_JOB_NAME: MembershipsJobs = 'recoverMembershipVerifications'
const VERIFICATION_RECOVERY_INTERVAL_MS = 300_000

const verificationDefaults = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000, jitter: 0.5 },
  removeOnComplete: true,
  removeOnFail: true,
}

const enqueueProcessMembershipVerificationJob = createEnqueueFunction<
  ProcessMembershipVerificationData,
  MembershipsJobs
>({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: VERIFICATION_JOB_NAME,
  defaults: verificationDefaults,
})

export const enqueueBulkProcessMembershipVerifications = createBulkEnqueueFunction<
  ProcessMembershipVerificationData,
  ProcessMembershipVerificationData,
  MembershipsJobs
>({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: VERIFICATION_JOB_NAME,
  defaults: verificationDefaults,
  buildJob: data => ({
    data,
    opts: verificationJobOptions(data),
  }),
})

const enqueueRecoverMembershipVerificationsJob = createEnqueueFunction<
  Record<string, never>,
  MembershipsJobs
>({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: VERIFICATION_RECOVERY_JOB_NAME,
  defaults: verificationDefaults,
})

export function enqueueProcessMembershipVerification(
  data: ProcessMembershipVerificationData,
): EnqueueReturnType {
  return enqueueProcessMembershipVerificationJob(data, verificationJobOptions(data))
}

export function enqueueRecoverMembershipVerifications(): EnqueueReturnType {
  const jobId = `membership-verification-recovery__${Math.floor(Date.now() / VERIFICATION_RECOVERY_INTERVAL_MS)}`
  return enqueueRecoverMembershipVerificationsJob({}, {
    jobId,
    priority: PRIORITY_DISPATCHER,
    deduplication: {
      id: 'membership-verification-recovery',
      mode: 'throttle',
      ttl: VERIFICATION_RECOVERY_INTERVAL_MS,
    },
  } satisfies Partial<JobOptions>)
}

function verificationJobOptions(data: ProcessMembershipVerificationData): Partial<JobOptions> {
  const jobId = `membership-verification__${data.verificationId}`
  return {
    jobId,
    priority: PRIORITY_DEFAULT,
    deduplication: { id: jobId, mode: 'simple' },
  }
}
