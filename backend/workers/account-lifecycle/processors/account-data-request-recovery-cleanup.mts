import { getDataRequestLimits } from '@services/account-data-requests/work-limits'
import {
  expireDataRequests,
  claimRecoverableDataRequests,
  deleteExportsFromS3,
} from '@services/account-data-requests'
import { enqueueOrReactivateBulkExportRequests } from '@queues/account-lifecycle/enqueues/account-data-requests'

export async function recoverExportRequests(
  requestIds?: readonly string[],
  batchSize = getDataRequestLimits().batchSize,
): Promise<{ enqueued: number; hasMore: boolean }> {
  const { maxBatches } = getDataRequestLimits()
  let enqueued = 0
  let hasMore = false
  for (let batch = 0; batch < maxBatches; batch++) {
    // no-mistakes-disable-next-line query-reached-per-item: page loop, not per item; each iteration is one batched claim whose commit removes those rows from the next page, and enqueue work stays bounded to one page.
    const result = await claimRecoverableDataRequests(requestIds, batchSize) // oxlint-disable-line no-await-in-loop -- committed recovery claims become ineligible before the next page.
    if (result.requests.length > 0) {
      // oxlint-disable-next-line no-await-in-loop -- one configured page of enqueues per claimed batch.
      await enqueueOrReactivateBulkExportRequests(result.requests)
    }
    enqueued += result.requests.length
    hasMore = result.hasMore
    if (!hasMore) break
  }
  return { enqueued, hasMore }
}

export async function processCleanupExpiredExports(
  requestIds?: readonly string[],
  batchSize = getDataRequestLimits().batchSize,
): Promise<{ hasMore: boolean }> {
  const { maxBatches } = getDataRequestLimits()
  for (let batch = 0; batch < maxBatches; batch++) {
    // no-mistakes-disable-next-line query-reached-per-item: page loop, not per item; each iteration is one batched expiry whose commit removes those rows from the next page, and S3 deletes stay bounded to one page.
    const s3Keys = await expireDataRequests(batchSize, requestIds) // oxlint-disable-line no-await-in-loop -- committed claims remove each completed page from the predicate.
    if (s3Keys.length === 0) return { hasMore: false }
    try {
      // oxlint-disable-next-line no-await-in-loop -- bound provider work to one claimed page.
      await deleteExportsFromS3(s3Keys)
    } catch {
      // Non-fatal: S3 lifecycle will eventually reclaim failed objects.
    }
    if (s3Keys.length < batchSize) return { hasMore: false }
  }
  return { hasMore: true }
}
