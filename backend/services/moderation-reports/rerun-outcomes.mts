import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type ReportJudgementRunStatus = 'active' | 'succeeded' | 'failed' | 'expired'

export async function createReportJudgementRun(reportId: string): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createReportJudgementRun */
    INSERT INTO moderation_report_judgement_runs (moderation_report_id)
    VALUES (${reportId}::uuid)
    RETURNING id
  `)
  return rows[0]!.id
}

/** Reads the authoritative generation before a manual run can incur another model call. */
export async function getReportJudgementRunStatus(
  reportId: string,
  runId: string,
): Promise<ReportJudgementRunStatus | null> {
  const { rows } = await read<{
    status: ReportJudgementRunStatus
  }>(sql`/* getReportJudgementRunStatus */
    SELECT status FROM moderation_report_judgement_runs
    WHERE moderation_report_id = ${reportId}::uuid AND id = ${runId}::uuid
  `)
  return rows[0]?.status ?? null
}

/** A late committed judgement always outranks an earlier failure observation. */
export async function markReportJudgementRunFailed(reportId: string, runId: string): Promise<void> {
  await markReportJudgementRunsFailed([{ reportId, runId }])
}

export async function markReportJudgementRunsFailed(
  runs: readonly { reportId: string; runId: string }[],
): Promise<number> {
  if (runs.length === 0) return 0
  const uniqueRuns = [...new Map(runs.map(run => [`${run.reportId}:${run.runId}`, run])).values()]
  const reportIds = uniqueRuns.map(run => run.reportId)
  const runIds = uniqueRuns.map(run => run.runId)
  const { rowCount } = await write(sql`/* markReportJudgementRunsFailed */
    UPDATE moderation_report_judgement_runs run SET failed_at = now()
    FROM unnest(${reportIds}::uuid[], ${runIds}::uuid[]) AS requested(report_id, run_id)
    WHERE run.id = requested.run_id AND run.moderation_report_id = requested.report_id
      AND run.id = ANY(${runIds}::uuid[])
      AND run.completed_at IS NULL AND run.failed_at IS NULL AND run.expired_at IS NULL
    RETURNING run.id
  `)
  return rowCount ?? 0
}

export async function markReportJudgementRunExpired(
  reportId: string,
  runId: string,
): Promise<void> {
  await write(sql`/* markReportJudgementRunExpired */
    UPDATE moderation_report_judgement_runs SET expired_at = now()
    WHERE moderation_report_id = ${reportId}::uuid AND id = ${runId}::uuid
      AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL
    RETURNING id
  `)
}
