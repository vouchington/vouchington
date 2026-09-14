import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import {
  APPLE_NOTIFICATION_RECOVERY_INTERVAL_MS,
  MEMBERSHIP_ENTITLEMENT_EFFECTS_INTERVAL_MS,
  MEMBERSHIP_GRANT_EXPIRY_INTERVAL_MS,
  STRIPE_CATALOG_RECONCILIATION_INTERVAL_MS,
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
} from '../config.mts'
import { memberships } from '../queues.mts'
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
import { refundReconciliationSchedule } from './refund-reconciliation.mts'

export const scheduledJobManifest = defineScheduledJobManifest(QUEUE_NAME, [
  {
    schedulerId: 'appleNotificationRecovery',
    repeat: { every: APPLE_NOTIFICATION_RECOVERY_INTERVAL_MS },
    template: {
      name: 'recoverAppleNotifications',
      data: {},
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
        removeOnComplete: 100,
        removeOnFail: 100,
        priority: PRIORITY_DISPATCHER,
      } satisfies JobOptions,
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
  refundReconciliationSchedule,
  {
    schedulerId: 'stripeCatalogReconciliation',
    repeat: { every: STRIPE_CATALOG_RECONCILIATION_INTERVAL_MS },
    template: {
      name: 'reconcileStripeMembershipCatalog',
      data: {},
      opts: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
        removeOnComplete: 100,
        removeOnFail: 100,
        priority: PRIORITY_DISPATCHER,
        ordering: { key: 'stripe-catalog:voucha-web', concurrency: 1 },
      } satisfies JobOptions,
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
      name: 'expireElapsedMemberships',
      data: {},
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
        removeOnComplete: 100,
        removeOnFail: 100,
        priority: PRIORITY_DISPATCHER,
      } satisfies JobOptions,
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
      name: 'deliverMembershipEntitlementEffects',
      data: {},
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
        removeOnComplete: 100,
        removeOnFail: 100,
        priority: PRIORITY_DISPATCHER,
      } satisfies JobOptions,
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
      name: 'processRenewalNotificationCheck',
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
        removeOnComplete: 100,
        removeOnFail: 100,
        priority: PRIORITY_DISPATCHER,
      } satisfies JobOptions,
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
      name: 'recoverMembershipVerifications',
      data: {},
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
        removeOnComplete: 100,
        removeOnFail: 100,
        priority: PRIORITY_DISPATCHER,
      } satisfies JobOptions,
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
      name: 'recoverStripeEvents',
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
        removeOnComplete: 100,
        removeOnFail: 100,
        priority: PRIORITY_DISPATCHER,
      } satisfies JobOptions,
    },
    operatorSurfaces: [{ kind: 'backfill', backfillId: 'stripe-event-recovery' }],
  },
])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(memberships, scheduledJobManifest)
  await Promise.all([
    enqueueReconcileStripeMembershipCatalog(),
    enqueueRefreshGooglePlayOidcTrust(),
  ])
}
