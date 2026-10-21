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

export async function processSubmitDsaStatementOfReasons(
  data: { submissionId: string },
  dependencies: { process?: typeof processDsaStatementSubmission } = {},
): Promise<ProcessDsaStatementSubmissionResult> {
  return (dependencies.process ?? processDsaStatementSubmission)(data.submissionId)
}

/** One bounded page of materialization and one bounded page of enqueue work per tick. */
export async function processReconcileDsaStatementSubmissions(
  overrides: {
    prepare?: typeof prepareDsaStatementSubmissionSweep
    search?: typeof searchRecoverableDsaStatementSubmissionIds
    enqueue?: typeof enqueueBulkSubmitDsaStatementOfReasons
  } = {},
): Promise<{ enqueued: number; hasMore: boolean }> {
  const prepared = await (overrides.prepare ?? prepareDsaStatementSubmissionSweep)()
  if (!prepared) return { enqueued: 0, hasMore: false }
  const page = await (overrides.search ?? searchRecoverableDsaStatementSubmissionIds)({
    from: prepared.from,
    limit: getCopyrightSweepLimits().batchSize,
  })
  await (overrides.enqueue ?? enqueueBulkSubmitDsaStatementOfReasons)(page.results)
  return {
    enqueued: page.results.length,
    hasMore: prepared.hasMore || page.page_info.has_next_page,
  }
}
