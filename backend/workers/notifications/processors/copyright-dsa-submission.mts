import { enqueueBulkSubmitDsaStatementOfReasons } from '@queues/notifications/enqueues'
import {
  processDsaStatementSubmission,
  type ProcessDsaStatementSubmissionResult,
} from '@services/copyright-notices/dsa-statement-submission'
import {
  prepareDsaStatementSubmissionSweep,
  searchRecoverableDsaStatementSubmissionIds,
} from '@services/copyright-notices/dsa-statement-submission-sweep'
import { getCopyrightSweepLimits } from '@services/copyright-notices/work-limits'

export async function processSubmitDsaStatementOfReasons(data: {
  submissionId: string
}): Promise<ProcessDsaStatementSubmissionResult> {
  return processDsaStatementSubmission(data.submissionId)
}

/** One bounded page of materialization and one bounded page of enqueue work per tick. */
export async function processReconcileDsaStatementSubmissions(
  options: {
    restrictionIds?: readonly string[]
    submissionIds?: readonly string[]
  } = {},
  batchSize = getCopyrightSweepLimits().batchSize,
): Promise<{ enqueued: number; hasMore: boolean }> {
  const prepared = await prepareDsaStatementSubmissionSweep(options, batchSize)
  if (!prepared) return { enqueued: 0, hasMore: false }
  const page = await searchRecoverableDsaStatementSubmissionIds({
    from: prepared.from,
    ids: options.submissionIds,
    limit: batchSize,
  })
  await enqueueBulkSubmitDsaStatementOfReasons(page.results)
  return {
    enqueued: page.results.length,
    hasMore: prepared.hasMore || page.page_info.has_next_page,
  }
}
