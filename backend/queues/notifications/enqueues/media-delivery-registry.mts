import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { PRIORITY_DEFAULT, QUEUE_NAME } from '../config.mts'
import { notifications } from '../queues.mts'

export type ReconcileMediaDeliveryRegistryData =
  | { scanBefore?: never; after?: never }
  | { scanBefore: string; after: string }
const FIVE_MINUTES_MS = 5 * 60 * 1000
const reconcileOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
  priority: PRIORITY_DEFAULT,
} satisfies Partial<JobOptions>
const enqueueApply = createEnqueueFunction<
  { deliveryKey: string },
  'processApplyMediaDeliveryRegistryRecord'
>({
  queue: notifications,
  queueName: QUEUE_NAME,
  jobName: 'processApplyMediaDeliveryRegistryRecord',
})
const enqueueReconcile = createEnqueueFunction<
  ReconcileMediaDeliveryRegistryData,
  'processReconcileMediaDeliveryRegistry'
>({
  queue: notifications,
  queueName: QUEUE_NAME,
  jobName: 'processReconcileMediaDeliveryRegistry',
})

export function enqueueApplyMediaDeliveryRegistryRecord(deliveryKey: string): EnqueueReturnType {
  return enqueueApply(
    { deliveryKey },
    {
      ...reconcileOptions,
      attempts: 5,
      deduplication: {
        id: `media-delivery-registry:${deliveryKey}`,
        mode: 'throttle',
        ttl: FIVE_MINUTES_MS,
      },
    },
  )
}

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
