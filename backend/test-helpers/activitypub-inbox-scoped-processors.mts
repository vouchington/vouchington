import { enqueueBulkActivityPubInboxDeliveries } from '@queues/activitypub/enqueues/inbox'
import {
  activityPubInboxDeliveryTransitions,
  getActivityPubInboxStorageSnapshot,
} from '@services/ap-inbox-activities'
import {
  cleanupExpiredDeliveries,
  processDelivery,
  rearmFailedDeliveries,
  recoverDeliveries,
} from '@workers/activitypub/processors/inbox'
import type { ActivityPubInboxJobProcessors } from '@workers/activitypub/processors/inbox-job'

export function scopedActivityPubInboxProcessors(
  deliveryId: string,
): ActivityPubInboxJobProcessors {
  const ids = [deliveryId]
  return {
    processDelivery,
    recoverDeliveries: () =>
      recoverDeliveries({
        claimRecoverable: () => activityPubInboxDeliveryTransitions.recover(ids),
        enqueueBulk: enqueueBulkActivityPubInboxDeliveries,
      }),
    rearmFailedDeliveries: () =>
      rearmFailedDeliveries({
        rearmFailed: () => activityPubInboxDeliveryTransitions.rearm(ids),
        enqueueBulk: enqueueBulkActivityPubInboxDeliveries,
      }),
    cleanupExpiredDeliveries: () =>
      cleanupExpiredDeliveries({
        expire: (category, limit) =>
          activityPubInboxDeliveryTransitions.expire(category, limit, ids),
        getSnapshot: getActivityPubInboxStorageSnapshot,
        log: () => undefined,
      }),
  }
}
