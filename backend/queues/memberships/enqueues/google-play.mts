import { createHash } from 'node:crypto'
import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  GOOGLE_PLAY_ACTIVE_SOURCE_RECOVERY_INTERVAL_MS,
  GOOGLE_PLAY_OIDC_REFRESH_INTERVAL_MS,
  GOOGLE_PLAY_RECOVERY_INTERVAL_MS,
  PRIORITY_DEFAULT,
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
} from '../config.mts'
import { memberships } from '../queues.mts'
import type {
  AcknowledgeGooglePlayPurchaseData,
  MembershipsJobs,
  ProcessGooglePlayNotificationData,
  ReconcileGooglePlayActiveSourceData,
} from '../types.mts'

const defaults = {
  attempts: 10,
  backoff: { type: 'exponential' as const, delay: 5000, jitter: 0.5 },
  removeOnComplete: true,
  removeOnFail: true,
}

const enqueueNotification = createEnqueueFunction<
  ProcessGooglePlayNotificationData,
  MembershipsJobs
>({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: 'processGooglePlayNotification',
  defaults,
})
const enqueueAcknowledgement = createEnqueueFunction<
  AcknowledgeGooglePlayPurchaseData,
  MembershipsJobs
>({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: 'acknowledgeGooglePlayPurchase',
  defaults,
})
const enqueueNotificationRecovery = createEnqueueFunction<Record<string, never>, MembershipsJobs>({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: 'recoverGooglePlayNotifications',
  defaults,
})
const enqueueActiveSource = createEnqueueFunction<
  ReconcileGooglePlayActiveSourceData,
  MembershipsJobs
>({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: 'reconcileGooglePlayActiveSource',
  defaults,
})
const enqueueActiveSourceRecovery = createEnqueueFunction<Record<string, never>, MembershipsJobs>({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: 'recoverGooglePlayActiveSources',
  defaults,
})
const enqueueAcknowledgementRecovery = createEnqueueFunction<
  Record<string, never>,
  MembershipsJobs
>({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: 'recoverGooglePlayAcknowledgements',
  defaults,
})
const enqueueOidcRefresh = createEnqueueFunction<Record<string, never>, MembershipsJobs>({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: 'refreshGooglePlayOidcTrust',
  defaults,
})

export function enqueueProcessGooglePlayNotification(data: {
  evidenceId: string
  purchaseToken: string
  environment: 'test' | 'production'
}): EnqueueReturnType {
  const purchaseTokenLookupSha256 = createHash('sha256').update(data.purchaseToken).digest('hex')
  const jobData = {
    evidenceId: data.evidenceId,
    purchaseTokenLookupSha256,
    environment: data.environment,
  }
  return enqueueNotification(jobData, {
    jobId: `google-play-notification__${data.evidenceId}`,
    priority: PRIORITY_DEFAULT,
    deduplication: { id: `google-play-notification__${data.evidenceId}`, mode: 'simple' },
    ordering: {
      key: `google-play-token:${data.environment}:${purchaseTokenLookupSha256}`,
      concurrency: 1,
    },
  } satisfies Partial<JobOptions>)
}

export function enqueueAcknowledgeGooglePlayPurchase(
  data: AcknowledgeGooglePlayPurchaseData,
): EnqueueReturnType {
  return enqueueAcknowledgement(data, {
    jobId: `google-play-acknowledgement__${data.acknowledgementId}`,
    priority: PRIORITY_DEFAULT,
    deduplication: { id: `google-play-acknowledgement__${data.acknowledgementId}`, mode: 'simple' },
  } satisfies Partial<JobOptions>)
}

export function enqueueRecoverGooglePlayNotifications(): EnqueueReturnType {
  return enqueueNotificationRecovery(
    {},
    recoveryOptions('google-play-notification-recovery', GOOGLE_PLAY_RECOVERY_INTERVAL_MS),
  )
}

export function enqueueReconcileGooglePlayActiveSource(
  data: ReconcileGooglePlayActiveSourceData,
): EnqueueReturnType {
  const bucket = Math.floor(Date.now() / GOOGLE_PLAY_ACTIVE_SOURCE_RECOVERY_INTERVAL_MS)
  return enqueueActiveSource(data, {
    jobId: `google-play-active-source__${data.sourceId}__${bucket}`,
    priority: PRIORITY_DEFAULT,
    deduplication: { id: `google-play-active-source__${data.sourceId}__${bucket}`, mode: 'simple' },
    ordering: { key: `google-play-source:${data.sourceId}`, concurrency: 1 },
  } satisfies Partial<JobOptions>)
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
