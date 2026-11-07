import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  GOOGLE_PLAY_ACTIVE_SOURCE_RECOVERY_INTERVAL_MS,
  GOOGLE_PLAY_OIDC_REFRESH_INTERVAL_MS,
  GOOGLE_PLAY_RECOVERY_INTERVAL_MS,
  PRIORITY_DISPATCHER,
} from '../config.mts'
import {
  buildGooglePlayNotificationJob,
  googlePlayAcknowledgementJobOptions,
  googlePlayJobDefaults as defaults,
  type GooglePlayNotificationInput,
} from './google-play-jobs.mts'
import type { AcknowledgeGooglePlayPurchaseData } from '../types.mts'
import { createMembershipEnqueueFunction } from './typed-job.mts'

const enqueueNotification = createMembershipEnqueueFunction(
  'processGooglePlayNotification',
  defaults,
)
const enqueueAcknowledgement = createMembershipEnqueueFunction(
  'acknowledgeGooglePlayPurchase',
  defaults,
)
const enqueueNotificationRecovery = createMembershipEnqueueFunction(
  'recoverGooglePlayNotifications',
  defaults,
)
const enqueueActiveSourceRecovery = createMembershipEnqueueFunction(
  'recoverGooglePlayActiveSources',
  defaults,
)
const enqueueAcknowledgementRecovery = createMembershipEnqueueFunction(
  'recoverGooglePlayAcknowledgements',
  defaults,
)
const enqueueOidcRefresh = createMembershipEnqueueFunction('refreshGooglePlayOidcTrust', defaults)

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
    priority: PRIORITY_DISPATCHER,
    deduplication: { id, mode: 'throttle', ttl: intervalMs },
  }
}
