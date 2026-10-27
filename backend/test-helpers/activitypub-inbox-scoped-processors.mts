import {
  getActivityPubInboxDeliveryJobStatus,
  removeFailedActivityPubInboxDelivery,
  enqueueBulkActivityPubInboxDeliveries,
} from '../queues/activitypub/enqueues/inbox.mts'
import {
  activityPubInboxDeliveryTransitions,
  getActivityPubInboxStorageSnapshot,
} from '../services/ap-inbox-activities/index.mts'
import {
  cleanupExpiredDeliveries,
  rearmFailedDeliveries,
  recoverDeliveries,
} from '../workers/activitypub/processors/inbox.mts'
import { activityPubInboxRecoveryClockPastEnqueueGrace } from '../workers/activitypub/processors/inbox-enqueue-grace.mts'

/** The maintenance processors of the durable inbox, each limited to the one delivery id. */
export function scopedActivityPubInboxProcessors(deliveryId: string) {
  const ids = [deliveryId]
  return {
    recoverDeliveries: () =>
      recoverDeliveries(undefined, {
        getJobStatus: getActivityPubInboxDeliveryJobStatus,
        reserveRequeues: activityPubInboxDeliveryTransitions.reserveRecoveryRequeues,
        releaseUnadmittedRequeues:
          activityPubInboxDeliveryTransitions.releaseUnadmittedRecoveryRequeues,
        exhaustRecoveryRequeues: activityPubInboxDeliveryTransitions.exhaustRecoveryRequeues,
        removeFailed: removeFailedActivityPubInboxDelivery,
        exhaust: activityPubInboxDeliveryTransitions.exhaust,
        readRecoverable: () => activityPubInboxDeliveryTransitions.recover(ids),
        enqueueBulk: enqueueBulkActivityPubInboxDeliveries,
        enqueueContinuation: () => Promise.resolve(null),
        pageSize: () => 2,
        // The scoped envelope is the subject, so treat it as already past the enqueue grace.
        now: () => activityPubInboxRecoveryClockPastEnqueueGrace(deliveryId),
      }),
    rearmFailedDeliveries: () =>
      rearmFailedDeliveries(undefined, {
        rearmFailed: () => activityPubInboxDeliveryTransitions.rearm(ids),
        enqueueBulk: enqueueBulkActivityPubInboxDeliveries,
        // One scoped id never fills a page, so a continuation is never needed.
        enqueueContinuation: () => Promise.resolve(null),
        pageSize: () => 2,
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
