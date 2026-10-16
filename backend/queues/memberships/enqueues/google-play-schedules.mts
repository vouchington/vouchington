import type { JobOptions } from 'glide-mq'
import {
  GOOGLE_PLAY_ACTIVE_SOURCE_RECOVERY_INTERVAL_MS,
  GOOGLE_PLAY_OIDC_REFRESH_INTERVAL_MS,
  GOOGLE_PLAY_RECOVERY_INTERVAL_MS,
  PRIORITY_DISPATCHER,
} from '../config.mts'
import {
  enqueueRecoverGooglePlayAcknowledgements,
  enqueueRecoverGooglePlayActiveSources,
  enqueueRecoverGooglePlayNotifications,
  enqueueRefreshGooglePlayOidcTrust,
} from '../enqueues.mts'

export const googlePlaySchedules = [
  {
    schedulerId: 'googlePlayNotificationRecovery',
    repeat: { every: GOOGLE_PLAY_RECOVERY_INTERVAL_MS },
    template: {
      name: 'recoverGooglePlayNotifications',
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
        id: 'googlePlayNotificationRecovery',
        schedule: 'every 5m',
        description: 'Re-enqueue pending Google Play notifications',
        trigger: enqueueRecoverGooglePlayNotifications,
      },
    ],
  },
  {
    schedulerId: 'googlePlayAcknowledgementRecovery',
    repeat: { every: GOOGLE_PLAY_RECOVERY_INTERVAL_MS },
    template: {
      name: 'recoverGooglePlayAcknowledgements',
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
        id: 'googlePlayAcknowledgementRecovery',
        schedule: 'every 5m',
        description: 'Re-enqueue pending Google Play acknowledgements',
        trigger: enqueueRecoverGooglePlayAcknowledgements,
      },
    ],
  },
  {
    schedulerId: 'googlePlayActiveSourceRecovery',
    repeat: { every: GOOGLE_PLAY_ACTIVE_SOURCE_RECOVERY_INTERVAL_MS },
    template: {
      name: 'recoverGooglePlayActiveSources',
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
        id: 'googlePlayActiveSourceRecovery',
        schedule: 'every 1h',
        description: 'Recheck known active Google Play sources when RTDN delivery is missing',
        trigger: enqueueRecoverGooglePlayActiveSources,
      },
    ],
  },
  {
    schedulerId: 'googlePlayOidcTrustRefresh',
    repeat: { every: GOOGLE_PLAY_OIDC_REFRESH_INTERVAL_MS },
    template: {
      name: 'refreshGooglePlayOidcTrust',
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
        id: 'googlePlayOidcTrustRefresh',
        schedule: 'every 3h',
        description: 'Refresh offline Google Pub/Sub OIDC signing keys',
        trigger: enqueueRefreshGooglePlayOidcTrust,
      },
    ],
  },
] as const
