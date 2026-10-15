import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundJob } from './define-job.mts'
import {
  MEMBERSHIPS_DOMAIN,
  type AcknowledgeGooglePlayPurchaseData,
  type EmptyMembershipsJobData as EmptyData,
  type ProcessAppleNotificationData,
  type ProcessGooglePlayNotificationData,
  type ProcessStripeEventData,
  type ReconcileGooglePlayActiveSourceData,
  type ReconcileMicrosoftStoreSourceData,
} from './memberships-domain.mts'

const BACKOFF = { type: 'exponential', delay: 5000, jitter: 0.5 } as const
const KEEP_100 = { removeOnComplete: 100, removeOnFail: 100 } as const
const DROP = { removeOnComplete: true, removeOnFail: true } as const
const RECOVERY = {
  priority: PRIORITY_DISPATCH,
  attempts: 3,
  backoff: BACKOFF,
  ...KEEP_100,
} as const
const PROVIDER_TASK = { priority: PRIORITY_TASK, attempts: 10, backoff: BACKOFF, ...DROP } as const

export const MEMBERSHIPS_STRIPE_EVENT_JOB = defineBackgroundJob<ProcessStripeEventData>(
  MEMBERSHIPS_DOMAIN,
  {
    name: 'processStripeEvent',
    priority: PRIORITY_TASK,
    attempts: 3,
    backoff: BACKOFF,
    ...KEEP_100,
  },
)
export const MEMBERSHIPS_RECOVER_STRIPE_EVENTS_JOB = defineBackgroundJob<EmptyData>(
  MEMBERSHIPS_DOMAIN,
  { name: 'recoverStripeEvents', ...RECOVERY },
)
export const MEMBERSHIPS_STRIPE_CATALOG_JOB = defineBackgroundJob<EmptyData>(MEMBERSHIPS_DOMAIN, {
  name: 'reconcileStripeMembershipCatalog',
  ...RECOVERY,
  attempts: 5,
})

export const MEMBERSHIPS_APPLE_NOTIFICATION_JOB = defineBackgroundJob<ProcessAppleNotificationData>(
  MEMBERSHIPS_DOMAIN,
  { name: 'processAppleNotification', ...PROVIDER_TASK },
)
export const MEMBERSHIPS_RECOVER_APPLE_NOTIFICATIONS_JOB = defineBackgroundJob<EmptyData>(
  MEMBERSHIPS_DOMAIN,
  { name: 'recoverAppleNotifications', ...RECOVERY, ...DROP },
)

export const MEMBERSHIPS_GOOGLE_PLAY_NOTIFICATION_JOB =
  defineBackgroundJob<ProcessGooglePlayNotificationData>(MEMBERSHIPS_DOMAIN, {
    name: 'processGooglePlayNotification',
    ...PROVIDER_TASK,
  })
export const MEMBERSHIPS_GOOGLE_PLAY_ACTIVE_SOURCE_JOB =
  defineBackgroundJob<ReconcileGooglePlayActiveSourceData>(MEMBERSHIPS_DOMAIN, {
    name: 'reconcileGooglePlayActiveSource',
    ...PROVIDER_TASK,
  })
export const MEMBERSHIPS_GOOGLE_PLAY_ACKNOWLEDGE_JOB =
  defineBackgroundJob<AcknowledgeGooglePlayPurchaseData>(MEMBERSHIPS_DOMAIN, {
    name: 'acknowledgeGooglePlayPurchase',
    ...PROVIDER_TASK,
  })
export const MEMBERSHIPS_RECOVER_GOOGLE_PLAY_NOTIFICATIONS_JOB = defineBackgroundJob<EmptyData>(
  MEMBERSHIPS_DOMAIN,
  { name: 'recoverGooglePlayNotifications', ...RECOVERY, ...DROP },
)
export const MEMBERSHIPS_RECOVER_GOOGLE_PLAY_ACTIVE_SOURCES_JOB = defineBackgroundJob<EmptyData>(
  MEMBERSHIPS_DOMAIN,
  { name: 'recoverGooglePlayActiveSources', ...RECOVERY, ...DROP },
)
export const MEMBERSHIPS_RECOVER_GOOGLE_PLAY_ACKNOWLEDGEMENTS_JOB = defineBackgroundJob<EmptyData>(
  MEMBERSHIPS_DOMAIN,
  { name: 'recoverGooglePlayAcknowledgements', ...RECOVERY, ...DROP },
)
export const MEMBERSHIPS_GOOGLE_PLAY_OIDC_REFRESH_JOB = defineBackgroundJob<EmptyData>(
  MEMBERSHIPS_DOMAIN,
  { name: 'refreshGooglePlayOidcTrust', ...RECOVERY, ...DROP },
)

export const MEMBERSHIPS_MICROSOFT_STORE_SOURCE_JOB =
  defineBackgroundJob<ReconcileMicrosoftStoreSourceData>(MEMBERSHIPS_DOMAIN, {
    name: 'reconcileMicrosoftStoreSource',
    ...PROVIDER_TASK,
  })
export const MEMBERSHIPS_RECOVER_MICROSOFT_STORE_SOURCES_JOB = defineBackgroundJob<EmptyData>(
  MEMBERSHIPS_DOMAIN,
  { name: 'recoverMicrosoftStoreSources', ...RECOVERY, ...DROP },
)

export const MEMBERSHIPS_PROVIDER_JOBS = [
  MEMBERSHIPS_STRIPE_EVENT_JOB,
  MEMBERSHIPS_RECOVER_STRIPE_EVENTS_JOB,
  MEMBERSHIPS_STRIPE_CATALOG_JOB,
  MEMBERSHIPS_APPLE_NOTIFICATION_JOB,
  MEMBERSHIPS_RECOVER_APPLE_NOTIFICATIONS_JOB,
  MEMBERSHIPS_GOOGLE_PLAY_NOTIFICATION_JOB,
  MEMBERSHIPS_GOOGLE_PLAY_ACTIVE_SOURCE_JOB,
  MEMBERSHIPS_GOOGLE_PLAY_ACKNOWLEDGE_JOB,
  MEMBERSHIPS_RECOVER_GOOGLE_PLAY_NOTIFICATIONS_JOB,
  MEMBERSHIPS_RECOVER_GOOGLE_PLAY_ACTIVE_SOURCES_JOB,
  MEMBERSHIPS_RECOVER_GOOGLE_PLAY_ACKNOWLEDGEMENTS_JOB,
  MEMBERSHIPS_GOOGLE_PLAY_OIDC_REFRESH_JOB,
  MEMBERSHIPS_MICROSOFT_STORE_SOURCE_JOB,
  MEMBERSHIPS_RECOVER_MICROSOFT_STORE_SOURCES_JOB,
] as const
