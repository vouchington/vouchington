import type { Job } from 'glide-mq'
import type { MembershipsJobPayloads } from '@queues/memberships/types'
import { processMembershipVerification } from '@services/memberships/process-verification'
import { processMembershipProviderJob } from './membership-provider-job.mts'

export function processMembershipVerificationJob(
  job: Job<MembershipsJobPayloads['processMembershipVerification']>,
): Promise<void> {
  return processMembershipProviderJob(job, () =>
    processMembershipVerification(job.data.verificationId),
  )
}
