import { enqueueBulkSubmitDsaStatementOfReasons } from '@queues/notifications/enqueues'
import {
  processDsaStatementSubmission,
  type ProcessDsaStatementSubmissionResult,
} from '@services/copyright-notices/dsa-statement-submission'
import {
  prepareDsaStatementSubmissionSweep,
  searchRecoverableDsaStatementSubmissionIds,
} from '@services/copyright-notices/dsa-statement-submission-sweep'

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
): Promise<{ enqueued: number }> {
  const from = await (overrides.prepare ?? prepareDsaStatementSubmissionSweep)()
  if (!from) return { enqueued: 0 }
  const page = await (overrides.search ?? searchRecoverableDsaStatementSubmissionIds)({
    from,
    limit: 100,
  })
  await (overrides.enqueue ?? enqueueBulkSubmitDsaStatementOfReasons)(page.results)
  return { enqueued: page.results.length }
}
