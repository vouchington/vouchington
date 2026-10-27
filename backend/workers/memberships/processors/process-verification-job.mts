import type { Job } from 'glide-mq'
import { processMembershipVerification } from '@services/memberships/process-verification'
import { processMembershipProviderJob } from './membership-provider-job.mts'

export function processMembershipVerificationJob(job: Job): Promise<void> {
  return processMembershipProviderJob(job, () =>
    processMembershipVerification(job.data.verificationId),
  )
}
