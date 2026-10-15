import {
  defineScheduledJobManifest,
  toSchedulerTemplateOptions,
} from '@modules/scheduled-job-manifest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import {
  MEMBERSHIPS_ENTITLEMENT_EFFECTS_JOB,
  MEMBERSHIPS_GRANT_EXPIRY_JOB,
  MEMBERSHIPS_RECOVER_VERIFICATIONS_JOB,
  MEMBERSHIPS_RENEWAL_CHECK_JOB,
} from '@queues/background/enqueues/memberships-jobs-2'
import {
  MEMBERSHIPS_RECOVER_APPLE_NOTIFICATIONS_JOB,
  MEMBERSHIPS_RECOVER_STRIPE_EVENTS_JOB,
  MEMBERSHIPS_STRIPE_CATALOG_JOB,
} from '@queues/background/enqueues/memberships-jobs'
import {
  APPLE_NOTIFICATION_RECOVERY_INTERVAL_MS,
  MEMBERSHIP_ENTITLEMENT_EFFECTS_INTERVAL_MS,
  MEMBERSHIP_GRANT_EXPIRY_INTERVAL_MS,
  STRIPE_CATALOG_RECONCILIATION_INTERVAL_MS,
} from '../config.mts'
import {
  enqueueDeliverMembershipEntitlementEffects,
  enqueueExpireElapsedMemberships,
  enqueueRecoverAppleNotifications,
  enqueueRefreshGooglePlayOidcTrust,
  enqueueRecoverMembershipVerifications,
  enqueueRenewalNotificationCheck,
  enqueueReconcileStripeMembershipCatalog,
} from '../enqueues.mts'
import { googlePlaySchedules } from './google-play-schedules.mts'
import { microsoftStoreSchedules } from './microsoft-store-schedules.mts'
import { directBillingSchedules } from './direct-billing-schedules.mts'
import { stripeCatalogOrdering } from './stripe-catalog.mts'

export const scheduledJobManifest = defineScheduledJobManifest(BACKGROUND_QUEUE_NAME, [
  {
    schedulerId: 'appleNotificationRecovery',
    repeat: { every: APPLE_NOTIFICATION_RECOVERY_INTERVAL_MS },
    template: {
      name: MEMBERSHIPS_RECOVER_APPLE_NOTIFICATIONS_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({ ...MEMBERSHIPS_RECOVER_APPLE_NOTIFICATIONS_JOB.options }),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'appleNotificationRecovery',
        schedule: 'every 5m',
        description: 'Re-enqueue pending Apple App Store notifications',
        trigger: enqueueRecoverAppleNotifications,
      },
    ],
  },
  ...googlePlaySchedules,
  ...microsoftStoreSchedules,
  ...directBillingSchedules,
  {
    schedulerId: 'stripeCatalogReconciliation',
    repeat: { every: STRIPE_CATALOG_RECONCILIATION_INTERVAL_MS },
    template: {
      name: MEMBERSHIPS_STRIPE_CATALOG_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({
        ...MEMBERSHIPS_STRIPE_CATALOG_JOB.options,
        ordering: stripeCatalogOrdering,
      }),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'stripeCatalogReconciliation',
        schedule: 'every 5m',
        description: 'Reconcile the Stripe membership catalog',
        trigger: enqueueReconcileStripeMembershipCatalog,
      },
    ],
  },
  {
    schedulerId: 'membershipGrantExpiry',
    repeat: { every: MEMBERSHIP_GRANT_EXPIRY_INTERVAL_MS },
    template: {
      name: MEMBERSHIPS_GRANT_EXPIRY_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({ ...MEMBERSHIPS_GRANT_EXPIRY_JOB.options }),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'membershipGrantExpiry',
        schedule: 'every 1m',
        description: 'Expire elapsed administrator membership grants',
        trigger: enqueueExpireElapsedMemberships,
      },
    ],
  },
  {
    schedulerId: 'membershipEntitlementEffects',
    repeat: { every: MEMBERSHIP_ENTITLEMENT_EFFECTS_INTERVAL_MS },
    template: {
      name: MEMBERSHIPS_ENTITLEMENT_EFFECTS_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({ ...MEMBERSHIPS_ENTITLEMENT_EFFECTS_JOB.options }),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'membershipEntitlementEffects',
        schedule: 'every 1m',
        description: 'Deliver durable membership entitlement effects',
        trigger: enqueueDeliverMembershipEntitlementEffects,
      },
    ],
  },
  {
    schedulerId: 'renewalNotificationCheck',
    repeat: { pattern: '0 9 * * *' },
    template: {
      name: MEMBERSHIPS_RENEWAL_CHECK_JOB.name,
      opts: toSchedulerTemplateOptions({ ...MEMBERSHIPS_RENEWAL_CHECK_JOB.options }),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'renewalNotificationCheck',
        schedule: '0 9 * * *',
        description: 'Check membership renewals and send notifications',
        trigger: enqueueRenewalNotificationCheck,
      },
    ],
  },
  {
    schedulerId: 'membershipVerificationRecovery',
    repeat: { every: 300_000 },
    template: {
      name: MEMBERSHIPS_RECOVER_VERIFICATIONS_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({ ...MEMBERSHIPS_RECOVER_VERIFICATIONS_JOB.options }),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'membershipVerificationRecovery',
        schedule: 'every 5m',
        description: 'Re-enqueue pending membership verification work',
        trigger: enqueueRecoverMembershipVerifications,
      },
    ],
  },
  {
    schedulerId: 'stripeEventRecovery',
    repeat: { every: 300_000 },
    template: {
      name: MEMBERSHIPS_RECOVER_STRIPE_EVENTS_JOB.name,
      opts: toSchedulerTemplateOptions({ ...MEMBERSHIPS_RECOVER_STRIPE_EVENTS_JOB.options }),
    },
    operatorSurfaces: [{ kind: 'backfill', backfillId: 'stripe-event-recovery' }],
  },
])

/** Seeds the two recovery jobs once at worker start, instead of waiting for their first interval. */
export async function enqueueMembershipStartupJobs(): Promise<void> {
  await Promise.all([
    enqueueReconcileStripeMembershipCatalog(),
    enqueueRefreshGooglePlayOidcTrust(),
  ])
}
