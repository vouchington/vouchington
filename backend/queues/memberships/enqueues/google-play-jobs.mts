import { createHash } from 'node:crypto'
import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { JobOptions } from 'glide-mq'
import {
  GOOGLE_PLAY_ACTIVE_SOURCE_RECOVERY_INTERVAL_MS,
  PRIORITY_DEFAULT,
  QUEUE_NAME,
} from '../config.mts'
import { memberships } from '../queues.mts'
import type {
  AcknowledgeGooglePlayPurchaseData,
  MembershipsJobs,
  ProcessGooglePlayNotificationData,
  ReconcileGooglePlayActiveSourceData,
} from '../types.mts'

/** Per-job identity and options shared by each single enqueue and its bulk twin. */
export const googlePlayJobDefaults = {
  attempts: 10,
  backoff: { type: 'exponential' as const, delay: 5000, jitter: 0.5 },
  removeOnComplete: true,
  removeOnFail: true,
}

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
      priority: PRIORITY_DEFAULT,
      deduplication: { id: `google-play-notification__${data.evidenceId}`, mode: 'simple' },
      ordering: {
        key: `google-play-token:${data.environment}:${purchaseTokenLookupSha256}`,
        concurrency: 1,
      },
    },
  }
}

export function googlePlayAcknowledgementJobOptions(
  data: AcknowledgeGooglePlayPurchaseData,
): Partial<JobOptions> {
  return {
    jobId: `google-play-acknowledgement__${data.acknowledgementId}`,
    priority: PRIORITY_DEFAULT,
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
    priority: PRIORITY_DEFAULT,
    deduplication: { id: `google-play-active-source__${data.sourceId}__${bucket}`, mode: 'simple' },
    ordering: { key: `google-play-source:${data.sourceId}`, concurrency: 1 },
  }
}

/** One batched add of `enqueueProcessGooglePlayNotification` jobs, each with its own stable id. */
export const enqueueBulkProcessGooglePlayNotifications = createBulkEnqueueFunction<
  GooglePlayNotificationInput,
  ProcessGooglePlayNotificationData,
  MembershipsJobs
>({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: 'processGooglePlayNotification',
  defaults: googlePlayJobDefaults,
  buildJob: buildGooglePlayNotificationJob,
})

/** One batched add of `enqueueAcknowledgeGooglePlayPurchase` jobs, each with its own stable id. */
export const enqueueBulkAcknowledgeGooglePlayPurchases = createBulkEnqueueFunction<
  AcknowledgeGooglePlayPurchaseData,
  AcknowledgeGooglePlayPurchaseData,
  MembershipsJobs
>({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: 'acknowledgeGooglePlayPurchase',
  defaults: googlePlayJobDefaults,
  buildJob: data => ({ data, opts: googlePlayAcknowledgementJobOptions(data) }),
})

const enqueueBulkActiveSource = createBulkEnqueueFunction<
  ReconcileGooglePlayActiveSourceData & { bucket: number },
  ReconcileGooglePlayActiveSourceData,
  MembershipsJobs
>({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: 'reconcileGooglePlayActiveSource',
  defaults: googlePlayJobDefaults,
  buildJob: ({ bucket, ...data }) => ({
    data,
    opts: googlePlayActiveSourceJobOptions(data, bucket),
  }),
})

/** One batched add of active-source reconciliation jobs sharing one hourly recovery bucket. */
export function enqueueBulkReconcileGooglePlayActiveSources(
  sources: ReconcileGooglePlayActiveSourceData[],
): ReturnType<typeof enqueueBulkActiveSource> {
  const bucket = currentGooglePlayActiveSourceBucket()
  return enqueueBulkActiveSource(sources.map(source => ({ ...source, bucket })))
}
