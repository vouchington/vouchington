import assert from 'http-assert'
import { recordStaffOperation } from '@services/moderator-actions/operation'
// ast-grep-ignore: backend-no-enqueue-and-wait -- existing wait removed by #3264
import { enqueueReportJudgementAndWait } from '@queues/ai-agents/enqueues/report-judgement'
import { getModerationReportById } from './get-by-id.mts'

export async function rerunReportJudgement(staffUserId: string, id: string): Promise<void> {
  const report = await getModerationReportById(id)
  assert(report, 404, 'Report not found')
  await recordStaffOperation(
    staffUserId,
    { actionType: 'report_judgement_rerun', reportId: report.id },
    async () => {
      // ast-grep-ignore: backend-no-enqueue-and-wait -- existing wait removed by #3264
      await enqueueReportJudgementAndWait(
        report.entity_type,
        report.entity_id,
        report.id,
        staffUserId,
      )
    },
  )
}
