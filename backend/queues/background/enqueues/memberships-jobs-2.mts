import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundJob } from './define-job.mts'
import {
  MEMBERSHIPS_DOMAIN,
  type EmptyMembershipsJobData as EmptyData,
  type ProcessMembershipVerificationData,
  type ProcessSendRenewalPriceIncreaseEmailData,
  type ReconcileMembershipRefundOperationData,
  type RenewalNotificationCheckData,
  type SyncMembershipPauseCollectionData,
} from './memberships-domain.mts'
import { MEMBERSHIPS_PROVIDER_JOBS } from './memberships-jobs.mts'

const BACKOFF = { type: 'exponential', delay: 5000, jitter: 0.5 } as const
const QUICK_BACKOFF = { type: 'exponential', delay: 1000, jitter: 0.5 } as const
const KEEP_100 = { removeOnComplete: 100, removeOnFail: 100 } as const
const DROP = { removeOnComplete: true, removeOnFail: true } as const
const DISPATCH = {
  priority: PRIORITY_DISPATCH,
  attempts: 3,
  backoff: BACKOFF,
  ...KEEP_100,
} as const

export const MEMBERSHIPS_VERIFICATION_JOB = defineBackgroundJob<ProcessMembershipVerificationData>(
  MEMBERSHIPS_DOMAIN,
  {
    name: 'processMembershipVerification',
    priority: PRIORITY_TASK,
    attempts: 3,
    backoff: BACKOFF,
    ...DROP,
  },
)
export const MEMBERSHIPS_RECOVER_VERIFICATIONS_JOB = defineBackgroundJob<EmptyData>(
  MEMBERSHIPS_DOMAIN,
  { name: 'recoverMembershipVerifications', ...DISPATCH, ...DROP },
)
export const MEMBERSHIPS_ENTITLEMENT_EFFECTS_JOB = defineBackgroundJob<EmptyData>(
  MEMBERSHIPS_DOMAIN,
  { name: 'deliverMembershipEntitlementEffects', ...DISPATCH, backoff: QUICK_BACKOFF },
)
export const MEMBERSHIPS_GRANT_EXPIRY_JOB = defineBackgroundJob<EmptyData>(MEMBERSHIPS_DOMAIN, {
  name: 'expireElapsedMemberships',
  ...DISPATCH,
  backoff: QUICK_BACKOFF,
})
export const MEMBERSHIPS_RENEWAL_CHECK_JOB = defineBackgroundJob<RenewalNotificationCheckData>(
  MEMBERSHIPS_DOMAIN,
  { name: 'processRenewalNotificationCheck', ...DISPATCH, backoff: QUICK_BACKOFF },
)
// The old enqueue set no attempts, so the email ran once; keep that for a message that must not repeat.
export const MEMBERSHIPS_RENEWAL_PRICE_INCREASE_EMAIL_JOB =
  defineBackgroundJob<ProcessSendRenewalPriceIncreaseEmailData>(MEMBERSHIPS_DOMAIN, {
    name: 'processSendRenewalPriceIncreaseEmail',
    priority: PRIORITY_TASK,
  })
export const MEMBERSHIPS_REFUND_DISPATCH_JOB = defineBackgroundJob<EmptyData>(MEMBERSHIPS_DOMAIN, {
  name: 'dispatchMembershipRefundReconciliation',
  ...DISPATCH,
})
export const MEMBERSHIPS_REFUND_OPERATION_JOB =
  defineBackgroundJob<ReconcileMembershipRefundOperationData>(MEMBERSHIPS_DOMAIN, {
    name: 'reconcileMembershipRefundOperation',
    priority: PRIORITY_TASK,
    attempts: 3,
    backoff: BACKOFF,
    ...KEEP_100,
  })
export const MEMBERSHIPS_PAUSE_COLLECTION_DISPATCH_JOB = defineBackgroundJob<EmptyData>(
  MEMBERSHIPS_DOMAIN,
  { name: 'dispatchMembershipPauseCollection', ...DISPATCH },
)
export const MEMBERSHIPS_PAUSE_COLLECTION_SYNC_JOB =
  defineBackgroundJob<SyncMembershipPauseCollectionData>(MEMBERSHIPS_DOMAIN, {
    name: 'syncMembershipPauseCollection',
    priority: PRIORITY_TASK,
    attempts: 5,
    backoff: BACKOFF,
    ...KEEP_100,
  })

export const MEMBERSHIPS_JOBS = [
  ...MEMBERSHIPS_PROVIDER_JOBS,
  MEMBERSHIPS_VERIFICATION_JOB,
  MEMBERSHIPS_RECOVER_VERIFICATIONS_JOB,
  MEMBERSHIPS_ENTITLEMENT_EFFECTS_JOB,
  MEMBERSHIPS_GRANT_EXPIRY_JOB,
  MEMBERSHIPS_RENEWAL_CHECK_JOB,
  MEMBERSHIPS_RENEWAL_PRICE_INCREASE_EMAIL_JOB,
  MEMBERSHIPS_REFUND_DISPATCH_JOB,
  MEMBERSHIPS_REFUND_OPERATION_JOB,
  MEMBERSHIPS_PAUSE_COLLECTION_DISPATCH_JOB,
  MEMBERSHIPS_PAUSE_COLLECTION_SYNC_JOB,
] as const
