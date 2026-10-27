import {
  activityPubInboxDeliveryTransitions,
  getActivityPubInboxStorageSnapshot,
} from '@services/ap-inbox-activities'
import { getApInboxActivitiesWorkLimit } from '@services/ap-inbox-activities/work-limits'

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
