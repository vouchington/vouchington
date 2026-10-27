import {
  enqueueBulkActivityPubInboxDeliveries,
  enqueueRearmFailedActivityPubInboxDeliveriesContinuation,
} from '@queues/activitypub/enqueues/inbox'
import { activityPubInboxDeliveryTransitions } from '@services/ap-inbox-activities'
import { getApInboxActivitiesWorkLimit } from '@services/ap-inbox-activities/work-limits'
export { cleanupExpiredDeliveries } from './inbox-cleanup.mts'
export { processDelivery } from './inbox-delivery.mts'
export { recoverDeliveries } from './inbox-recovery.mts'
export type { RecoverDeliveriesDependencies } from './inbox-recovery.mts'

export type RearmFailedDeliveriesDependencies = {
  rearmFailed: (afterId?: string) => ReturnType<typeof activityPubInboxDeliveryTransitions.rearm>
  enqueueBulk: typeof enqueueBulkActivityPubInboxDeliveries
  enqueueContinuation: typeof enqueueRearmFailedActivityPubInboxDeliveriesContinuation
  pageSize: () => number
}

const rearmFailedDeliveriesDependencies: RearmFailedDeliveriesDependencies = {
  rearmFailed: afterId => activityPubInboxDeliveryTransitions.rearm(undefined, afterId),
  enqueueBulk: enqueueBulkActivityPubInboxDeliveries,
  enqueueContinuation: enqueueRearmFailedActivityPubInboxDeliveriesContinuation,
  pageSize: () => getApInboxActivitiesWorkLimit('delivery_transition_recovery_batch_size'),
}

/**
 * Re-arms one page of failed deliveries. A full page continues through a job that carries the last
 * delivery id, so a large backlog never runs inside one job.
 */
export async function rearmFailedDeliveries(
  afterId?: string,
  dependencies: RearmFailedDeliveriesDependencies = rearmFailedDeliveriesDependencies,
): Promise<{ enqueued: number; hasMore: boolean }> {
  const deliveries = await dependencies.rearmFailed(afterId)
  if (deliveries.length === 0) return { enqueued: 0, hasMore: false }
  await dependencies.enqueueBulk(deliveries)
  // ast-grep-ignore: pagination-no-exact-limit-has-next -- the page is re-armed (updated) as it is read, so it cannot over-fetch one row; at an exact boundary the continuation re-arms nothing and ends
  const hasMore = deliveries.length >= dependencies.pageSize()
  if (hasMore) {
    const lastId = deliveries.map(delivery => delivery.deliveryId).reduce((a, b) => (a > b ? a : b))
    await dependencies.enqueueContinuation(lastId)
  }
  return { enqueued: deliveries.length, hasMore }
}
