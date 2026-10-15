import type { Job } from 'glide-mq'
import { deferPostgresConnectionTimeout } from '@modules/queue-errors'
import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import {
  MEMBERSHIPS_APPLE_NOTIFICATION_JOB,
  MEMBERSHIPS_GOOGLE_PLAY_ACKNOWLEDGE_JOB,
  MEMBERSHIPS_GOOGLE_PLAY_ACTIVE_SOURCE_JOB,
  MEMBERSHIPS_GOOGLE_PLAY_NOTIFICATION_JOB,
  MEMBERSHIPS_GOOGLE_PLAY_OIDC_REFRESH_JOB,
  MEMBERSHIPS_MICROSOFT_STORE_SOURCE_JOB,
  MEMBERSHIPS_RECOVER_APPLE_NOTIFICATIONS_JOB,
  MEMBERSHIPS_RECOVER_GOOGLE_PLAY_ACKNOWLEDGEMENTS_JOB,
  MEMBERSHIPS_RECOVER_GOOGLE_PLAY_ACTIVE_SOURCES_JOB,
  MEMBERSHIPS_RECOVER_GOOGLE_PLAY_NOTIFICATIONS_JOB,
  MEMBERSHIPS_RECOVER_MICROSOFT_STORE_SOURCES_JOB,
  MEMBERSHIPS_RECOVER_STRIPE_EVENTS_JOB,
  MEMBERSHIPS_STRIPE_CATALOG_JOB,
  MEMBERSHIPS_STRIPE_EVENT_JOB,
} from '@queues/background/enqueues/memberships-jobs'
import {
  MEMBERSHIPS_ENTITLEMENT_EFFECTS_JOB,
  MEMBERSHIPS_GRANT_EXPIRY_JOB,
  MEMBERSHIPS_PAUSE_COLLECTION_DISPATCH_JOB,
  MEMBERSHIPS_PAUSE_COLLECTION_SYNC_JOB,
  MEMBERSHIPS_RECOVER_VERIFICATIONS_JOB,
  MEMBERSHIPS_REFUND_DISPATCH_JOB,
  MEMBERSHIPS_REFUND_OPERATION_JOB,
  MEMBERSHIPS_RENEWAL_CHECK_JOB,
  MEMBERSHIPS_RENEWAL_PRICE_INCREASE_EMAIL_JOB,
  MEMBERSHIPS_VERIFICATION_JOB,
} from '@queues/background/enqueues/memberships-jobs-2'
import type { BackgroundHandler } from '@queues/background/types'
import { PROCESSORS, type MembershipJobProcessors } from './job-processors.mts'

/** Defers a job while PostgreSQL cannot hand out a connection, instead of burning an attempt. */
function guarded<TData>(run: (job: Job<TData>) => unknown): (job: Job<TData>) => Promise<unknown> {
  return job => deferPostgresConnectionTimeout(job, async () => run(job))
}

/** One handler per memberships job; `processors` is injectable so a test can observe each route. */
export function createMembershipsHandlers(
  p: MembershipJobProcessors = PROCESSORS,
): BackgroundHandler[] {
  return [
    backgroundHandler(
      MEMBERSHIPS_STRIPE_EVENT_JOB,
      guarded(job =>
        p.processStripeEvent(job.data, job.attemptsMade + 1 >= (job.opts.attempts ?? 1)),
      ),
    ),
    backgroundHandler(
      MEMBERSHIPS_RECOVER_STRIPE_EVENTS_JOB,
      guarded(() => p.recoverStripeEvents()),
    ),
    backgroundHandler(
      MEMBERSHIPS_STRIPE_CATALOG_JOB,
      guarded(() => p.reconcileStripeMembershipCatalog()),
    ),
    backgroundHandler(
      MEMBERSHIPS_APPLE_NOTIFICATION_JOB,
      guarded(job => p.processAppleNotification(job.data)),
    ),
    backgroundHandler(
      MEMBERSHIPS_RECOVER_APPLE_NOTIFICATIONS_JOB,
      guarded(() => p.recoverAppleNotifications()),
    ),
    backgroundHandler(
      MEMBERSHIPS_GOOGLE_PLAY_NOTIFICATION_JOB,
      guarded(job => p.processGooglePlayNotification(job.data)),
    ),
    backgroundHandler(
      MEMBERSHIPS_RECOVER_GOOGLE_PLAY_NOTIFICATIONS_JOB,
      guarded(() => p.recoverGooglePlayNotifications()),
    ),
    backgroundHandler(
      MEMBERSHIPS_RECOVER_GOOGLE_PLAY_ACTIVE_SOURCES_JOB,
      guarded(() => p.recoverGooglePlayActiveSources()),
    ),
    backgroundHandler(
      MEMBERSHIPS_GOOGLE_PLAY_ACTIVE_SOURCE_JOB,
      guarded(job => p.processGooglePlayActiveSource(job.data)),
    ),
    backgroundHandler(
      MEMBERSHIPS_GOOGLE_PLAY_ACKNOWLEDGE_JOB,
      guarded(job => p.processGooglePlayAcknowledgement(job.data)),
    ),
    backgroundHandler(
      MEMBERSHIPS_RECOVER_GOOGLE_PLAY_ACKNOWLEDGEMENTS_JOB,
      guarded(() => p.recoverGooglePlayAcknowledgements()),
    ),
    backgroundHandler(
      MEMBERSHIPS_GOOGLE_PLAY_OIDC_REFRESH_JOB,
      guarded(() => p.refreshGooglePlayOidcTrust()),
    ),
    backgroundHandler(
      MEMBERSHIPS_RECOVER_MICROSOFT_STORE_SOURCES_JOB,
      guarded(() => p.recoverMicrosoftStoreSources()),
    ),
    backgroundHandler(
      MEMBERSHIPS_MICROSOFT_STORE_SOURCE_JOB,
      guarded(job => p.reconcileMicrosoftStoreSource(job.data)),
    ),
    backgroundHandler(
      MEMBERSHIPS_VERIFICATION_JOB,
      guarded(job => p.processMembershipVerification(job.data.verificationId)),
    ),
    backgroundHandler(
      MEMBERSHIPS_RECOVER_VERIFICATIONS_JOB,
      guarded(() => p.recoverMembershipVerifications()),
    ),
    backgroundHandler(
      MEMBERSHIPS_ENTITLEMENT_EFFECTS_JOB,
      guarded(() => p.deliverMembershipEntitlementEffects()),
    ),
    backgroundHandler(
      MEMBERSHIPS_GRANT_EXPIRY_JOB,
      guarded(() => p.expireElapsedMemberships()),
    ),
    backgroundHandler(
      MEMBERSHIPS_RENEWAL_CHECK_JOB,
      guarded(job => p.processRenewalNotificationCheckDispatcher(job.data)),
    ),
    backgroundHandler(
      MEMBERSHIPS_RENEWAL_PRICE_INCREASE_EMAIL_JOB,
      guarded(job => p.processSendRenewalPriceIncreaseEmail(job.data)),
    ),
    backgroundHandler(
      MEMBERSHIPS_REFUND_DISPATCH_JOB,
      guarded(() => p.dispatchMembershipRefundReconciliation()),
    ),
    backgroundHandler(
      MEMBERSHIPS_REFUND_OPERATION_JOB,
      guarded(job =>
        p.reconcileMembershipRefundOperation({
          id: job.data.operationId,
          leaseToken: job.data.leaseToken,
        }),
      ),
    ),
    backgroundHandler(
      MEMBERSHIPS_PAUSE_COLLECTION_DISPATCH_JOB,
      guarded(() => p.dispatchMembershipPauseCollection()),
    ),
    backgroundHandler(
      MEMBERSHIPS_PAUSE_COLLECTION_SYNC_JOB,
      guarded(job => p.syncMembershipPauseCollection(job.data)),
    ),
  ] as BackgroundHandler[]
}
