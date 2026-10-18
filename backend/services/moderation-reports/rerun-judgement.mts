import assert from 'http-assert'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { recordStaffOperation } from '@services/moderator-actions/operation'
import { enqueueReportJudgement } from '@queues/ai-agents/enqueues/report-judgement'
import { getModerationReportById } from './get-by-id.mts'

export async function rerunReportJudgement(staffUserId: string, id: string): Promise<string> {
  const report = await getModerationReportById(id, { primary: true })
  assert(report, 404, 'Report not found')
  const { rows } = await write<{ id: string }>(
    sql`/* rerunReportJudgement:runId */ SELECT uuidv7() AS id`,
  )
  const runId = rows[0]!.id
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
