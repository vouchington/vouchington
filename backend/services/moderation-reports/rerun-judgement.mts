import assert from 'http-assert'
import { recordStaffOperation } from '@services/moderator-actions/operation'
import { enqueueReportJudgement } from '@queues/ai-agents/enqueues/report-judgement'
import { getModerationReportById } from './get-by-id.mts'
import { createReportJudgementRun } from './rerun-outcomes.mts'

export async function rerunReportJudgement(staffUserId: string, id: string): Promise<string> {
  const report = await getModerationReportById(id, { primary: true })
  assert(report, 404, 'Report not found')
  // Commit the exact admission before the queue can start its worker.
  const runId = await createReportJudgementRun(report.id)
  await recordStaffOperation(
    staffUserId,
    { actionType: 'report_judgement_rerun', reportId: report.id },
    async () => {
      await enqueueReportJudgement(
        report.entity_type,
        report.entity_id,
        report.id,
        staffUserId,
        null,
        runId,
      )
    },
  )
  return runId
}
