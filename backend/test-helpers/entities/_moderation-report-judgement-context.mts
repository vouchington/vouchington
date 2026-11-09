import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import crypto from 'node:crypto'
import {
  type ModerationReportReason,
  MODERATION_REPORT_REASON_SEVERITY_RANK,
} from '@ts-shared/utils/moderation-reports'

// Internal support module (leading underscore = not part of the public barrel).
// Simplified single-entity stand-in for the moderation-reports domain's judgement-context.mts:
// test-helpers only ever needs one entity's context at a time (never the batched multi-entity
// form used by the auto-dispatch pipeline), and no test asserts on these hash/count values, so
// this mirrors the shape without the batch/window-function machinery.

const MAX_TEST_JUDGEMENT_REPORTS = 50

export type TestReportJudgementContext = {
  contextHash: string
  reportCount: number
  reportCountCapped: boolean
  noteHash: string
  maxReasonRank: number
}

export async function getTestReportJudgementContext(
  fkColumn: string,
  entityId: string,
): Promise<TestReportJudgementContext> {
  const query = sql`/* getTestReportJudgementContext */ SELECT id, reason, note FROM moderation_reports WHERE `
  query.append(fkColumn)
  query.append(sql` = ${entityId}::uuid ORDER BY id DESC LIMIT 1001`)
  const { rows } = await read<{ id: string; reason: ModerationReportReason; note: string | null }>(
    query,
  )
  const reportCount = Math.min(rows.length, 1000)
  const reportCountCapped = rows.length > 1000
  const sample = rows.slice(0, MAX_TEST_JUDGEMENT_REPORTS)

  const normalizedReports = sample.map(report => ({
    id: report.id,
    reason: report.reason,
    note: report.note ?? null,
  }))
  return {
    contextHash: sha256({ reportCount, reportCountCapped, reports: normalizedReports }),
    reportCount,
    reportCountCapped,
    noteHash: sha256(normalizedReports.map(report => ({ id: report.id, note: report.note }))),
    maxReasonRank: normalizedReports.reduce(
      (max, report) => Math.max(max, MODERATION_REPORT_REASON_SEVERITY_RANK[report.reason]),
      0,
    ),
  }
}

function sha256(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
