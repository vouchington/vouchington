import { createHash } from 'node:crypto'
import { createBackgroundBulkEnqueue } from '@queues/background/enqueues'
import type {
  AcknowledgeGooglePlayPurchaseData,
  ProcessGooglePlayNotificationData,
  ReconcileGooglePlayActiveSourceData,
} from '@queues/background/enqueues/memberships-domain'
import {
  MEMBERSHIPS_GOOGLE_PLAY_ACKNOWLEDGE_JOB,
  MEMBERSHIPS_GOOGLE_PLAY_ACTIVE_SOURCE_JOB,
  MEMBERSHIPS_GOOGLE_PLAY_NOTIFICATION_JOB,
} from '@queues/background/enqueues/memberships-jobs'
import type { JobOptions } from 'glide-mq'
import { GOOGLE_PLAY_ACTIVE_SOURCE_RECOVERY_INTERVAL_MS } from '../config.mts'
import { membershipOrdering } from './ordering.mts'

export type GooglePlayNotificationInput = {
  evidenceId: string
  purchaseToken: string
  environment: 'test' | 'production'
}

export function buildGooglePlayNotificationJob(data: GooglePlayNotificationInput): {
  data: ProcessGooglePlayNotificationData
  opts: Partial<JobOptions>
} {
  const purchaseTokenLookupSha256 = createHash('sha256').update(data.purchaseToken).digest('hex')
  return {
    data: {
      evidenceId: data.evidenceId,
      purchaseTokenLookupSha256,
      environment: data.environment,
    },
    opts: {
      jobId: `google-play-notification__${data.evidenceId}`,
      deduplication: { id: `google-play-notification__${data.evidenceId}`, mode: 'simple' },
      ordering: membershipOrdering(
        `google-play-token:${data.environment}:${purchaseTokenLookupSha256}`,
      ),
    },
  }
}

export function googlePlayAcknowledgementJobOptions(
  data: AcknowledgeGooglePlayPurchaseData,
): Partial<JobOptions> {
  return {
    jobId: `google-play-acknowledgement__${data.acknowledgementId}`,
    deduplication: { id: `google-play-acknowledgement__${data.acknowledgementId}`, mode: 'simple' },
  }
}

function currentGooglePlayActiveSourceBucket(): number {
  return Math.floor(Date.now() / GOOGLE_PLAY_ACTIVE_SOURCE_RECOVERY_INTERVAL_MS)
}

function googlePlayActiveSourceJobOptions(
  data: ReconcileGooglePlayActiveSourceData,
  bucket: number,
): Partial<JobOptions> {
  return {
    jobId: `google-play-active-source__${data.sourceId}__${bucket}`,
    deduplication: { id: `google-play-active-source__${data.sourceId}__${bucket}`, mode: 'simple' },
    ordering: membershipOrdering(`google-play-source:${data.sourceId}`),
  }
}

/** One batched add of `enqueueProcessGooglePlayNotification` jobs, each with its own stable id. */
export const enqueueBulkProcessGooglePlayNotifications = createBackgroundBulkEnqueue(
  MEMBERSHIPS_GOOGLE_PLAY_NOTIFICATION_JOB,
  buildGooglePlayNotificationJob,
)

/** One batched add of `enqueueAcknowledgeGooglePlayPurchase` jobs, each with its own stable id. */
export const enqueueBulkAcknowledgeGooglePlayPurchases = createBackgroundBulkEnqueue(
  MEMBERSHIPS_GOOGLE_PLAY_ACKNOWLEDGE_JOB,
  (data: AcknowledgeGooglePlayPurchaseData) => ({
    data,
    opts: googlePlayAcknowledgementJobOptions(data),
  }),
)

const enqueueBulkActiveSource = createBackgroundBulkEnqueue(
  MEMBERSHIPS_GOOGLE_PLAY_ACTIVE_SOURCE_JOB,
  ({ bucket, ...data }: ReconcileGooglePlayActiveSourceData & { bucket: number }) => ({
    data,
    opts: googlePlayActiveSourceJobOptions(data, bucket),
  }),
)

/** One batched add of active-source reconciliation jobs sharing one hourly recovery bucket. */
export function enqueueBulkReconcileGooglePlayActiveSources(
  sources: ReconcileGooglePlayActiveSourceData[],
): ReturnType<typeof enqueueBulkActiveSource> {
  const bucket = currentGooglePlayActiveSourceBucket()
  return enqueueBulkActiveSource(sources.map(source => ({ ...source, bucket })))
}
