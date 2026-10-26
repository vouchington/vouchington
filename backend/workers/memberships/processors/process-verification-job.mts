import type { Job } from 'glide-mq'
import { processMembershipVerification } from '@services/memberships/process-verification'
import {
  processMembershipProviderJob,
  type MembershipProviderJobOptions,
} from './membership-provider-job.mts'

export function processMembershipVerificationJob(
  job: Job,
  options: MembershipProviderJobOptions = {},
): Promise<void> {
  return processMembershipProviderJob(
    job,
    () => processMembershipVerification(job.data.verificationId),
    options,
  )
}
