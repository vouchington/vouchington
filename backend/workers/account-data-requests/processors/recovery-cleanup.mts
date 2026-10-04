import { getDataRequestLimits } from '@services/account-data-requests/work-limits'
import {
  expireDataRequests,
  claimRecoverableDataRequests,
  deleteExportsFromS3,
} from '@services/account-data-requests'
import { enqueueBulkExportRequests } from '@queues/account-data-requests/enqueues'

type CleanupExpiredExportsDependencies = {
  deleteExportsFromS3: typeof deleteExportsFromS3
  expireDataRequests: typeof expireDataRequests
}
type RecoverExportRequestsDependencies = {
  claimRecoverableDataRequests: typeof claimRecoverableDataRequests
  enqueueBulkExportRequests: typeof enqueueBulkExportRequests
}

export async function recoverExportRequests(
  dependencies?: Partial<RecoverExportRequestsDependencies>,
): Promise<{ enqueued: number; hasMore: boolean }> {
  const claimRequests = dependencies?.claimRecoverableDataRequests ?? claimRecoverableDataRequests
  const enqueueRequests = dependencies?.enqueueBulkExportRequests ?? enqueueBulkExportRequests
  const { maxBatches } = getDataRequestLimits()
  let enqueued = 0
  let hasMore = false
  for (let batch = 0; batch < maxBatches; batch++) {
    // oxlint-disable-next-line no-await-in-loop -- committed recovery claims become ineligible before the next page.
    const result = await claimRequests()
    if (result.requests.length > 0) {
      // oxlint-disable-next-line no-await-in-loop -- one configured page of enqueues per claimed batch.
      await enqueueRequests(result.requests)
    }
    enqueued += result.requests.length
    hasMore = result.hasMore
    if (!hasMore) break
  }
  return { enqueued, hasMore }
}

export async function processCleanupExpiredExports(
  dependencies?: Partial<CleanupExpiredExportsDependencies>,
): Promise<{ hasMore: boolean }> {
  const expireRequests = dependencies?.expireDataRequests ?? expireDataRequests
  const deleteExports = dependencies?.deleteExportsFromS3 ?? deleteExportsFromS3
  const { batchSize, maxBatches } = getDataRequestLimits()
  for (let batch = 0; batch < maxBatches; batch++) {
    // oxlint-disable-next-line no-await-in-loop -- committed claims remove each completed page from the predicate.
    const s3Keys = await expireRequests(batchSize)
    if (s3Keys.length === 0) return { hasMore: false }
    try {
      // oxlint-disable-next-line no-await-in-loop -- bound provider work to one claimed page.
      await deleteExports(s3Keys)
    } catch {
      // Non-fatal: S3 lifecycle will eventually reclaim failed objects.
    }
    if (s3Keys.length < batchSize) return { hasMore: false }
  }
  return { hasMore: true }
}
