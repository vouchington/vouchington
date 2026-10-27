import {
  enqueueBulkActivityPubInboxDeliveries,
  getActivityPubInboxDeliveryJobStatus,
  removeFailedActivityPubInboxDelivery,
  enqueueRecoverActivityPubInboxDeliveriesContinuation,
} from '@queues/activitypub/enqueues/inbox'
import { activityPubInboxDeliveryTransitions } from '@services/ap-inbox-activities'
import { getApInboxActivitiesWorkLimit } from '@services/ap-inbox-activities/work-limits'
import { isInsideActivityPubInboxEnqueueGrace } from './inbox-enqueue-grace.mts'

type RecoverDeliveriesDependencies = {
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

type Delivery = Awaited<ReturnType<RecoverDeliveriesDependencies['readRecoverable']>>[number]

const isReplaceable = (state: string) =>
  state === 'missing' || state === 'completed' || state === 'stale-terminal'

/**
 * Recovers one bounded page. A row whose lookup, checkpoint, or removal throws is skipped, and a
 * failed bulk admission is held back, so one poison row never stops the cursor from advancing to
 * the later envelopes. The collected errors are thrown once the page and its continuation are done.
 */
export async function recoverDeliveries(
  afterId?: string,
  dependencies: RecoverDeliveriesDependencies = recoverDeliveriesDependencies,
): Promise<{ enqueued: number; hasMore: boolean }> {
  const deliveries = await dependencies.readRecoverable(afterId)
  if (deliveries.length === 0) return { enqueued: 0, hasMore: false }
  const nowMs = Date.now()
  const errors: unknown[] = []
  const replacementCandidates: Delivery[] = []
  for (const delivery of deliveries) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- one bounded page limits terminal job lookups
      const status = await dependencies.getJobStatus(delivery)
      if (
        status.state === 'missing' &&
        isInsideActivityPubInboxEnqueueGrace(delivery.deliveryId, nowMs)
      ) {
        continue
      }
      if (isReplaceable(status.state)) {
        replacementCandidates.push(delivery)
      } else if (status.state === 'failed') {
        // oxlint-disable-next-line no-await-in-loop -- checkpoint a terminal stall before continuing this bounded page
        const checkpoint = await dependencies.exhaust(delivery.deliveryId, new Error(status.reason))
        if (checkpoint.outcome === 'applied') {
          // oxlint-disable-next-line no-await-in-loop -- preserve the checkpoint-before-removal order per row
          await dependencies.removeFailed(delivery)
        }
      }
    } catch (err) {
      errors.push(err)
    }
  }
  const reservations = await dependencies.reserveRequeues(
    replacementCandidates.map(delivery => delivery.deliveryId),
  )
  const saturated = []
  for (const delivery of replacementCandidates) {
    if (reservations.has(delivery.deliveryId)) continue
    try {
      // oxlint-disable-next-line no-await-in-loop -- recheck the bounded page before terminalizing a row
      const status = await dependencies.getJobStatus(delivery)
      if (isReplaceable(status.state)) saturated.push(delivery.deliveryId)
    } catch (err) {
      errors.push(err)
    }
  }
  await dependencies.exhaustRecoveryRequeues(saturated)
  const pending = replacementCandidates.filter(delivery => reservations.has(delivery.deliveryId))
  let jobs: Awaited<ReturnType<typeof dependencies.enqueueBulk>> | undefined
  try {
    jobs = await dependencies.enqueueBulk(pending)
  } catch (err) {
    errors.push(await releaseAfterFailedAdmission(dependencies, pending, reservations, err))
  }
  if (jobs) {
    const admittedJobIds = new Set(jobs.map(job => job.id))
    await dependencies.releaseUnadmittedRequeues(
      pending.flatMap(delivery =>
        admittedJobIds.has(`activitypub-inbox__${delivery.requestDigest}`)
          ? []
          : [{ deliveryId: delivery.deliveryId, count: reservations.get(delivery.deliveryId)! }],
      ),
    )
  }
  // ast-grep-ignore: pagination-no-exact-limit-has-next -- bounded page continuation ends on an empty page at an exact boundary
  const hasMore = deliveries.length >= dependencies.pageSize()
  if (hasMore) {
    const lastId = deliveries.map(delivery => delivery.deliveryId).reduce((a, b) => (a > b ? a : b))
    await dependencies.enqueueContinuation(lastId)
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) {
    throw new AggregateError(errors, 'ActivityPub inbox recovery page had row failures')
  }
  return { enqueued: jobs?.length ?? 0, hasMore }
}

/**
 * GlideMQ bulk admission is non-atomic: a thrown batch may have admitted some rows. Only a
 * still-missing job proves its reservation was unused. If Valkey cannot answer, retain the
 * reservation conservatively rather than permit an unbounded retry loop.
 */
async function releaseAfterFailedAdmission(
  dependencies: RecoverDeliveriesDependencies,
  pending: readonly Delivery[],
  reservations: ReadonlyMap<string, number>,
  err: unknown,
): Promise<unknown> {
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
    } catch (err_) {
      lookupError = err_
      break
    }
  }
  await dependencies.releaseUnadmittedRequeues(unadmitted)
  if (!lookupError) return err
  return new AggregateError([err, lookupError], 'ActivityPub inbox admission result unknown', {
    cause: err,
  })
}
