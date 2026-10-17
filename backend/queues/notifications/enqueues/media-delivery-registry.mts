import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import type {
  ReconcileMediaDeliveryRegistryData,
  ReplayMediaDeliveryRegistryData,
} from '@queues/background/enqueues/notifications-domain'
import {
  NOTIFICATIONS_APPLY_MEDIA_REGISTRY_RECORD_JOB,
  NOTIFICATIONS_RECONCILE_MEDIA_REGISTRY_JOB,
  NOTIFICATIONS_REPLAY_MEDIA_REGISTRY_JOB,
} from '@queues/background/enqueues/notifications-jobs'
import type { EnqueueReturnType } from '@voucha/types'

export type { ReconcileMediaDeliveryRegistryData, ReplayMediaDeliveryRegistryData }
const FIVE_MINUTES_MS = 5 * 60 * 1000

/** One batched add of apply-record jobs, each with its own per-record dedup id. */
export const enqueueBulkApplyMediaDeliveryRegistryRecords = createBackgroundBulkEnqueue(
  NOTIFICATIONS_APPLY_MEDIA_REGISTRY_RECORD_JOB,
  (mediaDeliveryRegistryRecordId: string) => ({
    data: { mediaDeliveryRegistryRecordId },
    opts: {
      deduplication: {
        id: `media-delivery-registry:${mediaDeliveryRegistryRecordId}`,
        mode: 'throttle' as const,
        ttl: FIVE_MINUTES_MS,
      },
    },
  }),
)
const enqueueReconcile = createBackgroundEnqueue(NOTIFICATIONS_RECONCILE_MEDIA_REGISTRY_JOB)

export function enqueueReconcileMediaDeliveryRegistry(): EnqueueReturnType {
  return enqueueReconcile(
    {},
    {
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
      deduplication: {
        id: `media-delivery-registry-staging:${staging.scanBefore}:${staging.after.placement_id}:${staging.after.placement_revision}:${staging.after.image_id}`,
        mode: 'throttle',
        ttl: FIVE_MINUTES_MS,
      },
    },
  )
}

const enqueueReplay = createBackgroundEnqueue(NOTIFICATIONS_REPLAY_MEDIA_REGISTRY_JOB)

export function enqueueReplayMediaDeliveryRegistry(
  data: ReplayMediaDeliveryRegistryData,
): EnqueueReturnType {
  return enqueueReplay(data, {
    deduplication: {
      id: `media-delivery-registry-replay:${data.actorUserId}:${data.after ?? 'start'}`,
      mode: 'throttle',
      ttl: FIVE_MINUTES_MS,
    },
  })
}
