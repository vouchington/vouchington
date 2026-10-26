import { DelayedError, type Job } from 'glide-mq'
import { UnrecoverableError } from '@vouchington/queue-errors'
import {
  enqueueBulkActivityPubInboxDeliveries,
  getActivityPubInboxDeliveryFailure,
  enqueueRecoverActivityPubInboxDeliveriesContinuation,
  enqueueRearmFailedActivityPubInboxDeliveriesContinuation,
} from '@queues/activitypub/enqueues/inbox'
import {
  activityPubInboxDeliveryTransitions,
  getActivityPubInboxStorageSnapshot,
  processDurableActivityPubInboxDelivery,
} from '@services/ap-inbox-activities'
import { getApInboxActivitiesWorkLimit } from '@services/ap-inbox-activities/work-limits'
import type { ActivityPubInboxDeliveryJob } from '@queues/activitypub/types'

export type RecoverDeliveriesDependencies = {
  getFailure: typeof getActivityPubInboxDeliveryFailure
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
}

export type RearmFailedDeliveriesDependencies = {
  rearmFailed: (afterId?: string) => ReturnType<typeof activityPubInboxDeliveryTransitions.rearm>
  enqueueBulk: typeof enqueueBulkActivityPubInboxDeliveries
  enqueueContinuation: typeof enqueueRearmFailedActivityPubInboxDeliveriesContinuation
  pageSize: () => number
}

const recoverDeliveriesDependencies: RecoverDeliveriesDependencies = {
  getFailure: getActivityPubInboxDeliveryFailure,
  exhaust: activityPubInboxDeliveryTransitions.exhaust,
  readRecoverable: afterId => activityPubInboxDeliveryTransitions.recover(undefined, afterId),
  enqueueContinuation: enqueueRecoverActivityPubInboxDeliveriesContinuation,
  pageSize: () => getApInboxActivitiesWorkLimit('delivery_transition_recovery_batch_size'),
  enqueueBulk: enqueueBulkActivityPubInboxDeliveries,
}

const rearmFailedDeliveriesDependencies: RearmFailedDeliveriesDependencies = {
  rearmFailed: afterId => activityPubInboxDeliveryTransitions.rearm(undefined, afterId),
  enqueueBulk: enqueueBulkActivityPubInboxDeliveries,
  enqueueContinuation: enqueueRearmFailedActivityPubInboxDeliveriesContinuation,
  pageSize: () => getApInboxActivitiesWorkLimit('delivery_transition_recovery_batch_size'),
}

export type CleanupExpiredDeliveriesDependencies = {
  expire: (
    category: Parameters<typeof activityPubInboxDeliveryTransitions.expire>[0],
    limit?: number,
  ) => ReturnType<typeof activityPubInboxDeliveryTransitions.expire>
  getSnapshot: typeof getActivityPubInboxStorageSnapshot
  log: (event: Record<string, unknown>) => void
}

const cleanupExpiredDeliveriesDependencies: CleanupExpiredDeliveriesDependencies = {
  expire: activityPubInboxDeliveryTransitions.expire,
  getSnapshot: getActivityPubInboxStorageSnapshot,
  log: event => console.info(JSON.stringify(event)),
}

export async function processDelivery(
  data: ActivityPubInboxDeliveryJob,
  options: { isFinalAttempt: boolean; moveToDelayed: Job['moveToDelayed'] },
): Promise<void> {
  try {
    const result = await processDurableActivityPubInboxDelivery(data.deliveryId)
    if (result.outcome !== 'deferred') return

    await options.moveToDelayed(result.deferredUntil.getTime())
  } catch (err) {
    if (err instanceof DelayedError) throw err
    if (isTerminalProtocolError(err)) {
      await activityPubInboxDeliveryTransitions.reject(data.deliveryId)
      throw new UnrecoverableError(err instanceof Error ? err.message : String(err))
    }
    if (options.isFinalAttempt) {
      await activityPubInboxDeliveryTransitions.exhaust(data.deliveryId, err)
    }
    throw err
  }
}

export async function recoverDeliveries(
  afterId?: string,
  dependencies: RecoverDeliveriesDependencies = recoverDeliveriesDependencies,
): Promise<{ enqueued: number; hasMore: boolean }> {
  const deliveries = await dependencies.readRecoverable(afterId)
  if (deliveries.length === 0) return { enqueued: 0, hasMore: false }
  const pending = []
  for (const delivery of deliveries) {
    // oxlint-disable-next-line no-await-in-loop -- one bounded page limits terminal job lookups
    const failure = await dependencies.getFailure(delivery)
    if (failure === undefined) pending.push(delivery)
    else {
      // oxlint-disable-next-line no-await-in-loop -- checkpoint a terminal stall before continuing this bounded page
      await dependencies.exhaust(delivery.deliveryId, new Error(failure))
    }
  }
  const jobs = await dependencies.enqueueBulk(pending)
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

export async function cleanupExpiredDeliveries(
  dependencies: CleanupExpiredDeliveriesDependencies = cleanupExpiredDeliveriesDependencies,
): Promise<{
  batches: number
  deletedRows: number
  deletedRawBodyBytes: number
  budgetExhausted: boolean
}> {
  const batchSize = getApInboxActivitiesWorkLimit('cleanup_batch_size')
  const maximumBatches = getApInboxActivitiesWorkLimit('cleanup_maximum_batches')
  let batches = 0
  let deletedRows = 0
  let deletedRawBodyBytes = 0
  let lastBatchWasFull = false
  let budgetExhausted = false
  const categories = ['unverified', 'verified-operational'] as const

  for (const [categoryIndex, category] of categories.entries()) {
    while (batches < maximumBatches) {
      // oxlint-disable-next-line no-await-in-loop -- each committed batch determines whether the bounded cleanup should continue
      const batch = await dependencies.expire(category, batchSize)
      lastBatchWasFull = batch.deletedRows === batchSize
      if (batch.deletedRows > 0) {
        batches += 1
        deletedRows += batch.deletedRows
        deletedRawBodyBytes += batch.deletedRawBodyBytes
        dependencies.log({
          event: 'activitypub_inbox_cleanup_batch',
          category,
          deletedRows: batch.deletedRows,
          deletedRawBodyBytes: batch.deletedRawBodyBytes,
        })
      }
      if (!lastBatchWasFull) break
    }
    if (batches >= maximumBatches) {
      budgetExhausted = lastBatchWasFull || categoryIndex < categories.length - 1
      break
    }
  }

  const snapshot = await dependencies.getSnapshot()
  dependencies.log({
    event: 'activitypub_inbox_cleanup_snapshot',
    ...snapshot,
    cleanupBatches: batches,
    budgetExhausted,
  })
  return { batches, deletedRows, deletedRawBodyBytes, budgetExhausted }
}

function isTerminalProtocolError(error: unknown): boolean {
  const typed = error as { status?: unknown; statusCode?: unknown }
  const status =
    typeof typed?.status === 'number'
      ? typed.status
      : typeof typed?.statusCode === 'number'
        ? typed.statusCode
        : 500
  return status >= 400 && status < 500 && status !== 408 && status !== 429
}
