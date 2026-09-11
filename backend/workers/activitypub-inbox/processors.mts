import { UnrecoverableError } from '@modules/queue-errors'
import {
  enqueueBulkActivityPubInboxDeliveries,
  enqueueDelayedActivityPubInboxDelivery,
} from '@queues/activitypub-inbox/enqueues'
import {
  activityPubInboxDeliveryTransitions,
  getActivityPubInboxStorageSnapshot,
  processDurableActivityPubInboxDelivery,
} from '@services/ap-inbox-activities'
import { ACTIVITYPUB_INBOX_STORAGE_POLICY } from '@modules/activitypub-inbox-storage-policy'
import type { ActivityPubInboxDeliveryJob } from '@queues/activitypub-inbox/types'

export type RecoverDeliveriesDependencies = {
  claimRecoverable: () => ReturnType<typeof activityPubInboxDeliveryTransitions.recover>
  enqueueBulk: typeof enqueueBulkActivityPubInboxDeliveries
}

export type RearmFailedDeliveriesDependencies = {
  rearmFailed: () => ReturnType<typeof activityPubInboxDeliveryTransitions.rearm>
  enqueueBulk: typeof enqueueBulkActivityPubInboxDeliveries
}

const recoverDeliveriesDependencies: RecoverDeliveriesDependencies = {
  claimRecoverable: activityPubInboxDeliveryTransitions.recover,
  enqueueBulk: enqueueBulkActivityPubInboxDeliveries,
}

const rearmFailedDeliveriesDependencies: RearmFailedDeliveriesDependencies = {
  rearmFailed: activityPubInboxDeliveryTransitions.rearm,
  enqueueBulk: enqueueBulkActivityPubInboxDeliveries,
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
  options: { isFinalAttempt: boolean },
): Promise<void> {
  try {
    const result = await processDurableActivityPubInboxDelivery(
      data.deliveryId,
      data.processingAttemptId,
    )
    if (result.outcome !== 'deferred') return

    await enqueueDelayedActivityPubInboxDelivery(
      { deliveryId: result.deliveryId, processingAttemptId: result.processingAttemptId },
      Math.max(0, result.deferredUntil.getTime() - Date.now()),
    )
  } catch (error) {
    if (isTerminalProtocolError(error)) {
      await activityPubInboxDeliveryTransitions.reject(data.deliveryId, data.processingAttemptId)
      throw new UnrecoverableError(error instanceof Error ? error.message : String(error))
    }
    if (options.isFinalAttempt) {
      await activityPubInboxDeliveryTransitions.exhaust(
        data.deliveryId,
        data.processingAttemptId,
        error,
      )
    } else {
      await activityPubInboxDeliveryTransitions.release(
        data.deliveryId,
        data.processingAttemptId,
        error,
      )
    }
    throw error
  }
}

export async function recoverDeliveries(
  dependencies: RecoverDeliveriesDependencies = recoverDeliveriesDependencies,
): Promise<{ enqueued: number }> {
  const deliveries = await dependencies.claimRecoverable()
  if (deliveries.length > 0) await dependencies.enqueueBulk(deliveries)
  return { enqueued: deliveries.length }
}

export async function rearmFailedDeliveries(
  dependencies: RearmFailedDeliveriesDependencies = rearmFailedDeliveriesDependencies,
): Promise<{ enqueued: number }> {
  return rearmNextFailedDeliveryBatch(dependencies, 0)
}

export async function cleanupExpiredDeliveries(
  dependencies: CleanupExpiredDeliveriesDependencies = cleanupExpiredDeliveriesDependencies,
): Promise<{
  batches: number
  deletedRows: number
  deletedRawBodyBytes: number
  budgetExhausted: boolean
}> {
  let batches = 0
  let deletedRows = 0
  let deletedRawBodyBytes = 0
  let lastBatchWasFull = false
  let budgetExhausted = false
  const categories = ['unverified', 'verified-operational'] as const

  for (const [categoryIndex, category] of categories.entries()) {
    while (batches < ACTIVITYPUB_INBOX_STORAGE_POLICY.maximumCleanupBatches) {
      // oxlint-disable-next-line no-await-in-loop -- each committed batch determines whether the bounded cleanup should continue
      const batch = await dependencies.expire(
        category,
        ACTIVITYPUB_INBOX_STORAGE_POLICY.cleanupBatchSize,
      )
      lastBatchWasFull = batch.deletedRows === ACTIVITYPUB_INBOX_STORAGE_POLICY.cleanupBatchSize
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
    if (batches >= ACTIVITYPUB_INBOX_STORAGE_POLICY.maximumCleanupBatches) {
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

async function rearmNextFailedDeliveryBatch(
  dependencies: RearmFailedDeliveriesDependencies,
  enqueued: number,
): Promise<{ enqueued: number }> {
  const deliveries = await dependencies.rearmFailed()
  if (deliveries.length === 0) return { enqueued }
  await dependencies.enqueueBulk(deliveries)
  return rearmNextFailedDeliveryBatch(dependencies, enqueued + deliveries.length)
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
