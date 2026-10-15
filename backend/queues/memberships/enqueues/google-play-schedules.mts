import { toSchedulerTemplateOptions } from '@modules/scheduled-job-manifest'
import {
  MEMBERSHIPS_GOOGLE_PLAY_OIDC_REFRESH_JOB,
  MEMBERSHIPS_RECOVER_GOOGLE_PLAY_ACKNOWLEDGEMENTS_JOB,
  MEMBERSHIPS_RECOVER_GOOGLE_PLAY_ACTIVE_SOURCES_JOB,
  MEMBERSHIPS_RECOVER_GOOGLE_PLAY_NOTIFICATIONS_JOB,
} from '@queues/background/enqueues/memberships-jobs'
import {
  GOOGLE_PLAY_ACTIVE_SOURCE_RECOVERY_INTERVAL_MS,
  GOOGLE_PLAY_OIDC_REFRESH_INTERVAL_MS,
  GOOGLE_PLAY_RECOVERY_INTERVAL_MS,
} from '../config.mts'
import {
  enqueueRecoverGooglePlayAcknowledgements,
  enqueueRecoverGooglePlayActiveSources,
  enqueueRecoverGooglePlayNotifications,
  enqueueRefreshGooglePlayOidcTrust,
} from './google-play.mts'

export const googlePlaySchedules = [
  {
    schedulerId: 'googlePlayNotificationRecovery',
    repeat: { every: GOOGLE_PLAY_RECOVERY_INTERVAL_MS },
    template: {
      name: MEMBERSHIPS_RECOVER_GOOGLE_PLAY_NOTIFICATIONS_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({
        ...MEMBERSHIPS_RECOVER_GOOGLE_PLAY_NOTIFICATIONS_JOB.options,
      }),
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
      name: MEMBERSHIPS_RECOVER_GOOGLE_PLAY_ACKNOWLEDGEMENTS_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({
        ...MEMBERSHIPS_RECOVER_GOOGLE_PLAY_ACKNOWLEDGEMENTS_JOB.options,
      }),
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
      name: MEMBERSHIPS_RECOVER_GOOGLE_PLAY_ACTIVE_SOURCES_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({
        ...MEMBERSHIPS_RECOVER_GOOGLE_PLAY_ACTIVE_SOURCES_JOB.options,
      }),
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
      name: MEMBERSHIPS_GOOGLE_PLAY_OIDC_REFRESH_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({ ...MEMBERSHIPS_GOOGLE_PLAY_OIDC_REFRESH_JOB.options }),
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
