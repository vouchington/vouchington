import { enqueueSubmitDsaStatementOfReasons } from '@queues/notifications/enqueues'
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
    enqueue?: typeof enqueueSubmitDsaStatementOfReasons
  } = {},
): Promise<{ enqueued: number }> {
  const from = await (overrides.prepare ?? prepareDsaStatementSubmissionSweep)()
  if (!from) return { enqueued: 0 }
  const page = await (overrides.search ?? searchRecoverableDsaStatementSubmissionIds)({
    from,
    limit: 100,
  })
  let enqueued = 0
  for (const submissionId of page.results) {
    // oxlint-disable-next-line no-await-in-loop -- a bounded page must finish enqueueing before success.
    await (overrides.enqueue ?? enqueueSubmitDsaStatementOfReasons)(submissionId)
    enqueued += 1
  }
  return { enqueued }
}
