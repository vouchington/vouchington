import {
  enqueueBulkActivityPubInboxDeliveries,
  getActivityPubInboxDeliveryJobStatus,
  removeFailedActivityPubInboxDelivery,
  enqueueRecoverActivityPubInboxDeliveriesContinuation,
  enqueueRearmFailedActivityPubInboxDeliveriesContinuation,
} from '@queues/activitypub/enqueues/inbox'
import { activityPubInboxDeliveryTransitions } from '@services/ap-inbox-activities'
import { getApInboxActivitiesWorkLimit } from '@services/ap-inbox-activities/work-limits'
import { isInsideActivityPubInboxEnqueueGrace } from './inbox-enqueue-grace.mts'
export { cleanupExpiredDeliveries } from './inbox-cleanup.mts'
export { processDelivery } from './inbox-delivery.mts'

export type RecoverDeliveriesDependencies = {
  getJobStatus: typeof getActivityPubInboxDeliveryJobStatus
  exhaust: (
    deliveryId: string,
    error: unknown,
  ) => ReturnType<typeof activityPubInboxDeliveryTransitions.exhaust>
  readRecoverable: (
    afterId?: string,
  ) => ReturnType<typeof activityPubInboxDeliveryTransitions.recover>
  enqueueContinuation: typeof enqueueRecoverActivityPubInboxDeliveriesContinuation
  pageSize: () => number
  enqueueBulk: typeof enqueueBulkActivityPubInboxDeliveries
  removeFailed: typeof removeFailedActivityPubInboxDelivery
  reserveRequeues: (
    deliveryIds: readonly string[],
  ) => ReturnType<typeof activityPubInboxDeliveryTransitions.reserveRecoveryRequeues>
  releaseUnadmittedRequeues: (
    ...args: Parameters<
      typeof activityPubInboxDeliveryTransitions.releaseUnadmittedRecoveryRequeues
    >
  ) => ReturnType<typeof activityPubInboxDeliveryTransitions.releaseUnadmittedRecoveryRequeues>
  exhaustRecoveryRequeues: (
    deliveryIds: readonly string[],
  ) => ReturnType<typeof activityPubInboxDeliveryTransitions.exhaustRecoveryRequeues>
  now?: () => number
}

export type RearmFailedDeliveriesDependencies = {
  rearmFailed: (afterId?: string) => ReturnType<typeof activityPubInboxDeliveryTransitions.rearm>
  enqueueBulk: typeof enqueueBulkActivityPubInboxDeliveries
  enqueueContinuation: typeof enqueueRearmFailedActivityPubInboxDeliveriesContinuation
  pageSize: () => number
}

const recoverDeliveriesDependencies: RecoverDeliveriesDependencies = {
  getJobStatus: getActivityPubInboxDeliveryJobStatus,
  exhaust: activityPubInboxDeliveryTransitions.exhaust,
  readRecoverable: afterId => activityPubInboxDeliveryTransitions.recover(undefined, afterId),
  enqueueContinuation: enqueueRecoverActivityPubInboxDeliveriesContinuation,
  pageSize: () => getApInboxActivitiesWorkLimit('delivery_transition_recovery_batch_size'),
  enqueueBulk: enqueueBulkActivityPubInboxDeliveries,
  removeFailed: removeFailedActivityPubInboxDelivery,
  reserveRequeues: activityPubInboxDeliveryTransitions.reserveRecoveryRequeues,
  releaseUnadmittedRequeues: activityPubInboxDeliveryTransitions.releaseUnadmittedRecoveryRequeues,
  exhaustRecoveryRequeues: activityPubInboxDeliveryTransitions.exhaustRecoveryRequeues,
}

const rearmFailedDeliveriesDependencies: RearmFailedDeliveriesDependencies = {
  rearmFailed: afterId => activityPubInboxDeliveryTransitions.rearm(undefined, afterId),
  enqueueBulk: enqueueBulkActivityPubInboxDeliveries,
  enqueueContinuation: enqueueRearmFailedActivityPubInboxDeliveriesContinuation,
  pageSize: () => getApInboxActivitiesWorkLimit('delivery_transition_recovery_batch_size'),
}

export async function recoverDeliveries(
  afterId?: string,
  dependencies: RecoverDeliveriesDependencies = recoverDeliveriesDependencies,
): Promise<{ enqueued: number; hasMore: boolean }> {
  const deliveries = await dependencies.readRecoverable(afterId)
  if (deliveries.length === 0) return { enqueued: 0, hasMore: false }
  const nowMs = dependencies.now?.() ?? Date.now()
  const replacementCandidates = []
  for (const delivery of deliveries) {
    // oxlint-disable-next-line no-await-in-loop -- one bounded page limits terminal job lookups
    const status = await dependencies.getJobStatus(delivery)
    if (
      status.state === 'missing' &&
      isInsideActivityPubInboxEnqueueGrace(delivery.deliveryId, nowMs)
    ) {
      continue
    }
    if (
      status.state === 'missing' ||
      status.state === 'completed' ||
      status.state === 'stale-terminal'
    ) {
      replacementCandidates.push(delivery)
    } else if (status.state === 'failed') {
      // oxlint-disable-next-line no-await-in-loop -- checkpoint a terminal stall before continuing this bounded page
      const checkpoint = await dependencies.exhaust(delivery.deliveryId, new Error(status.reason))
      if (checkpoint.outcome === 'applied') {
        // oxlint-disable-next-line no-await-in-loop -- preserve the checkpoint-before-removal order per row
        await dependencies.removeFailed(delivery)
      }
    }
  }
  const reservations = await dependencies.reserveRequeues(
    replacementCandidates.map(delivery => delivery.deliveryId),
  )
  const saturated = []
  for (const delivery of replacementCandidates) {
    if (reservations.has(delivery.deliveryId)) continue
    // oxlint-disable-next-line no-await-in-loop -- recheck the bounded page before terminalizing a row
    const status = await dependencies.getJobStatus(delivery)
    if (
      status.state === 'missing' ||
      status.state === 'completed' ||
      status.state === 'stale-terminal'
    ) {
      saturated.push(delivery.deliveryId)
    }
  }
  await dependencies.exhaustRecoveryRequeues(saturated)
  const pending = replacementCandidates.filter(delivery => reservations.has(delivery.deliveryId))
  let jobs: Awaited<ReturnType<typeof dependencies.enqueueBulk>>
  try {
    jobs = await dependencies.enqueueBulk(pending)
  } catch (err) {
    // GlideMQ bulk admission is non-atomic: a thrown batch may have admitted some rows.
    // Only a still-missing job proves its reservation was unused. If Valkey cannot answer,
    // retain the reservation conservatively rather than permit an unbounded retry loop.
    const unadmitted = []
    let lookupError: unknown
    for (const delivery of pending) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- inspect only this failed bounded batch
        const status = await dependencies.getJobStatus(delivery)
        if (status.state === 'missing' || status.state === 'stale-terminal') {
          unadmitted.push({
            deliveryId: delivery.deliveryId,
            count: reservations.get(delivery.deliveryId)!,
          })
        }
      } catch (err) {
        lookupError = err
        break
      }
    }
    await dependencies.releaseUnadmittedRequeues(unadmitted)
    if (lookupError) {
      throw new AggregateError([err, lookupError], 'ActivityPub inbox admission result unknown', {
        cause: err,
      })
    }
    throw err
  }
  const admittedJobIds = new Set(jobs.map(job => job.id))
  await dependencies.releaseUnadmittedRequeues(
    pending.flatMap(delivery =>
      admittedJobIds.has(`activitypub-inbox__${delivery.requestDigest}`)
        ? []
        : [
            {
              deliveryId: delivery.deliveryId,
              count: reservations.get(delivery.deliveryId)!,
            },
          ],
    ),
  )
  // ast-grep-ignore: pagination-no-exact-limit-has-next -- bounded page continuation ends on an empty page at an exact boundary
  const hasMore = deliveries.length >= dependencies.pageSize()
  if (hasMore) {
    const lastId = deliveries.map(delivery => delivery.deliveryId).reduce((a, b) => (a > b ? a : b))
    await dependencies.enqueueContinuation(lastId)
  }
  return { enqueued: jobs.length, hasMore }
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
