import { randomInt } from 'node:crypto'
import { Worker, type Job } from 'glide-mq'
import { clampRateLimitDelayMs } from '@vouchington/queue-errors'
import { getMembershipVerificationRetryMinutes } from '@queues/memberships/config'
import {
  acquireMembershipVerificationExecutionLease,
  releaseMembershipVerificationExecutionLease,
} from '@queues/memberships/enqueues/verification-execution-lease'
import { GooglePlayPurchasePendingError } from '@services/memberships/google/process-verification'
import { runWithMembershipVerificationLeaseRenewal } from './verification-execution-renewal.mts'

const LEASE_CONTENTION_RETRY_MS = 1_000
const LEASE_CONTENTION_JITTER_MS = 500

export type MembershipProviderJobOptions = { leaseNamespace?: string }

/** Canonical verifications and unbound notification lookups share one provider-call cap. */
export async function processMembershipProviderJob(
  job: Job,
  operation: () => Promise<void>,
  options: MembershipProviderJobOptions = {},
): Promise<void> {
  const lease = await acquireMembershipVerificationExecutionLease(options.leaseNamespace)
  if (!lease)
    return job.moveToDelayed(
      Date.now() + LEASE_CONTENTION_RETRY_MS + randomInt(LEASE_CONTENTION_JITTER_MS + 1),
    )

  let processingFailure: { error: unknown } | undefined
  let released = false
  try {
    await runWithMembershipVerificationLeaseRenewal(lease, operation)
  } catch (err) {
    processingFailure = { error: err }
  } finally {
    released = await releaseMembershipVerificationExecutionLease(lease)
  }
  if (!released) throw new Error('Membership verification execution lease lost before release')

  if (processingFailure?.error instanceof GooglePlayPurchasePendingError)
    return job.moveToDelayed(Date.now() + getMembershipVerificationRetryMinutes() * 60_000)
  if (processingFailure?.error instanceof Worker.RateLimitError)
    return job.moveToDelayed(
      Date.now() + clampRateLimitDelayMs((processingFailure.error as { delayMs?: number }).delayMs),
    )
  if (processingFailure) throw processingFailure.error
}
