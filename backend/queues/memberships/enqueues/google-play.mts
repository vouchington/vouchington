import { createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  MEMBERSHIPS_GOOGLE_PLAY_ACKNOWLEDGE_JOB,
  MEMBERSHIPS_GOOGLE_PLAY_NOTIFICATION_JOB,
  MEMBERSHIPS_GOOGLE_PLAY_OIDC_REFRESH_JOB,
  MEMBERSHIPS_RECOVER_GOOGLE_PLAY_ACKNOWLEDGEMENTS_JOB,
  MEMBERSHIPS_RECOVER_GOOGLE_PLAY_ACTIVE_SOURCES_JOB,
  MEMBERSHIPS_RECOVER_GOOGLE_PLAY_NOTIFICATIONS_JOB,
} from '@queues/background/enqueues/memberships-jobs'
import type { AcknowledgeGooglePlayPurchaseData } from '@queues/background/enqueues/memberships-domain'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  GOOGLE_PLAY_ACTIVE_SOURCE_RECOVERY_INTERVAL_MS,
  GOOGLE_PLAY_OIDC_REFRESH_INTERVAL_MS,
  GOOGLE_PLAY_RECOVERY_INTERVAL_MS,
} from '../config.mts'
import {
  buildGooglePlayNotificationJob,
  googlePlayAcknowledgementJobOptions,
  type GooglePlayNotificationInput,
} from './google-play-jobs.mts'

const enqueueNotification = createBackgroundEnqueue(MEMBERSHIPS_GOOGLE_PLAY_NOTIFICATION_JOB)
const enqueueAcknowledgement = createBackgroundEnqueue(MEMBERSHIPS_GOOGLE_PLAY_ACKNOWLEDGE_JOB)
const enqueueNotificationRecovery = createBackgroundEnqueue(
  MEMBERSHIPS_RECOVER_GOOGLE_PLAY_NOTIFICATIONS_JOB,
)
const enqueueActiveSourceRecovery = createBackgroundEnqueue(
  MEMBERSHIPS_RECOVER_GOOGLE_PLAY_ACTIVE_SOURCES_JOB,
)
const enqueueAcknowledgementRecovery = createBackgroundEnqueue(
  MEMBERSHIPS_RECOVER_GOOGLE_PLAY_ACKNOWLEDGEMENTS_JOB,
)
const enqueueOidcRefresh = createBackgroundEnqueue(MEMBERSHIPS_GOOGLE_PLAY_OIDC_REFRESH_JOB)

export function enqueueProcessGooglePlayNotification(
  data: GooglePlayNotificationInput,
): EnqueueReturnType {
  const job = buildGooglePlayNotificationJob(data)
  return enqueueNotification(job.data, job.opts)
}

export function enqueueAcknowledgeGooglePlayPurchase(
  data: AcknowledgeGooglePlayPurchaseData,
): EnqueueReturnType {
  return enqueueAcknowledgement(data, googlePlayAcknowledgementJobOptions(data))
}

export function enqueueRecoverGooglePlayNotifications(): EnqueueReturnType {
  return enqueueNotificationRecovery(
    {},
    recoveryOptions('google-play-notification-recovery', GOOGLE_PLAY_RECOVERY_INTERVAL_MS),
  )
}

export function enqueueRecoverGooglePlayActiveSources(): EnqueueReturnType {
  return enqueueActiveSourceRecovery(
    {},
    recoveryOptions(
      'google-play-active-source-recovery',
      GOOGLE_PLAY_ACTIVE_SOURCE_RECOVERY_INTERVAL_MS,
    ),
  )
}

export function enqueueRecoverGooglePlayAcknowledgements(): EnqueueReturnType {
  return enqueueAcknowledgementRecovery(
    {},
    recoveryOptions('google-play-acknowledgement-recovery', GOOGLE_PLAY_RECOVERY_INTERVAL_MS),
  )
}

export function enqueueRefreshGooglePlayOidcTrust(): EnqueueReturnType {
  return enqueueOidcRefresh(
    {},
    recoveryOptions('google-play-oidc-refresh', GOOGLE_PLAY_OIDC_REFRESH_INTERVAL_MS),
  )
}

function recoveryOptions(id: string, intervalMs: number): Partial<JobOptions> {
  return {
    jobId: `${id}__${Math.floor(Date.now() / intervalMs)}`,
    deduplication: { id, mode: 'throttle', ttl: intervalMs },
  }
}
