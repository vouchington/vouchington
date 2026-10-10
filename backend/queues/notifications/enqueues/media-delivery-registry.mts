import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { PRIORITY_DEFAULT, QUEUE_NAME } from '../config.mts'
import { notifications } from '../queues.mts'

export type ReconcileMediaDeliveryRegistryData =
  | { scanBefore?: never; after?: never; staging?: never }
  | { scanBefore: string; after: string; staging?: never }
  | {
      scanBefore?: never
      after?: never
      staging: {
        scanBefore: string
        after: { placement_id: string; placement_revision: number; image_id: string }
      }
    }
const FIVE_MINUTES_MS = 5 * 60 * 1000
const reconcileOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
  priority: PRIORITY_DEFAULT,
} satisfies Partial<JobOptions>
/** One batched add of apply-record jobs, each with its own per-record dedup id. */
export const enqueueBulkApplyMediaDeliveryRegistryRecords = createBulkEnqueueFunction<
  string,
  { mediaDeliveryRegistryRecordId: string },
  'processApplyMediaDeliveryRegistryRecord'
>({
  queue: notifications,
  queueName: QUEUE_NAME,
  jobName: 'processApplyMediaDeliveryRegistryRecord',
  buildJob: mediaDeliveryRegistryRecordId => ({
    data: { mediaDeliveryRegistryRecordId },
    opts: {
      ...reconcileOptions,
      attempts: 5,
      deduplication: {
        id: `media-delivery-registry:${mediaDeliveryRegistryRecordId}`,
        mode: 'throttle',
        ttl: FIVE_MINUTES_MS,
      },
    },
  }),
})
const enqueueReconcile = createEnqueueFunction<
  ReconcileMediaDeliveryRegistryData,
  'processReconcileMediaDeliveryRegistry'
>({
  queue: notifications,
  queueName: QUEUE_NAME,
  jobName: 'processReconcileMediaDeliveryRegistry',
})

export function enqueueReconcileMediaDeliveryRegistry(): EnqueueReturnType {
  return enqueueReconcile(
    {},
    {
      ...reconcileOptions,
      deduplication: {
        id: 'media-delivery-registry-reconciliation',
        mode: 'throttle',
        ttl: FIVE_MINUTES_MS,
      },
    },
  )
}

export function enqueueContinueMediaDeliveryRegistryReconciliation(
  data: Extract<ReconcileMediaDeliveryRegistryData, { scanBefore: string }>,
): EnqueueReturnType {
  return enqueueReconcile(data, {
    ...reconcileOptions,
    deduplication: {
      id: `media-delivery-registry-continuation:${data.scanBefore}:${data.after}`,
      mode: 'throttle',
      ttl: FIVE_MINUTES_MS,
    },
  })
}

export function enqueueContinueMediaDeliveryRegistryStaging(
  staging: NonNullable<ReconcileMediaDeliveryRegistryData['staging']>,
): EnqueueReturnType {
  return enqueueReconcile(
    { staging },
    {
      ...reconcileOptions,
      deduplication: {
        id: `media-delivery-registry-staging:${staging.scanBefore}:${staging.after.placement_id}:${staging.after.placement_revision}:${staging.after.image_id}`,
        mode: 'throttle',
        ttl: FIVE_MINUTES_MS,
      },
    },
  )
}

export type ReplayMediaDeliveryRegistryData = { actorUserId: string; after?: string }
const enqueueReplay = createEnqueueFunction<
  ReplayMediaDeliveryRegistryData,
  'processReplayMediaDeliveryRegistry'
>({
  queue: notifications,
  queueName: QUEUE_NAME,
  jobName: 'processReplayMediaDeliveryRegistry',
})

export function enqueueReplayMediaDeliveryRegistry(
  data: ReplayMediaDeliveryRegistryData,
): EnqueueReturnType {
  return enqueueReplay(data, {
    ...reconcileOptions,
    deduplication: {
      id: `media-delivery-registry-replay:${data.after ?? 'start'}`,
      mode: 'throttle',
      ttl: FIVE_MINUTES_MS,
    },
  })
}
