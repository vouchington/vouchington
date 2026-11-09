import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'

type RunStatus = 'active' | 'succeeded' | 'failed' | 'expired'

function outcomeDates(status: RunStatus, at: Date) {
  return {
    completedAt: status === 'succeeded' ? at : null,
    failedAt: status === 'failed' ? at : null,
    expiredAt: status === 'expired' ? at : null,
  }
}

export async function insertTestReportJudgementRunForRetention(
  reportId: string,
  at: Date,
  status: RunStatus,
): Promise<string> {
  const id = uuidv7({ msecs: at.getTime() })
  const { completedAt, failedAt, expiredAt } = outcomeDates(status, at)
  await write(sql`/* insertTestReportJudgementRunForRetention */
    INSERT INTO moderation_report_judgement_runs
      (id, moderation_report_id, completed_at, failed_at, expired_at)
    VALUES (${id}::uuid, ${reportId}::uuid, ${completedAt}, ${failedAt}, ${expiredAt})`)
  return id
}

export async function insertTestAppealResolutionRunForRetention(
  appealId: string,
  at: Date,
  status: RunStatus,
): Promise<string> {
  const id = uuidv7({ msecs: at.getTime() })
  const { completedAt, failedAt, expiredAt } = outcomeDates(status, at)
  await write(sql`/* insertTestAppealResolutionRunForRetention */
    INSERT INTO moderation_appeal_resolution_runs
      (id, moderation_appeal_id, completed_at, failed_at, expired_at,
       result)
    VALUES (${id}::uuid, ${appealId}::uuid, ${completedAt}, ${failedAt}, ${expiredAt},
      ${status === 'succeeded' ? { draftSavedAt: at.toISOString() } : null}::jsonb)`)
  return id
}

export async function getTestReportJudgementRunStatus(id: string): Promise<RunStatus | null> {
  const { rows } = await read<{ status: RunStatus }>(sql`/* getTestReportJudgementRunStatus */
    SELECT status FROM moderation_report_judgement_runs WHERE id = ${id}::uuid LIMIT 1`)
  return rows[0]?.status ?? null
}

export async function attachTestJudgementToRun(judgementId: string, runId: string): Promise<void> {
  await write(sql`/* attachTestJudgementToRun */
    UPDATE moderation_report_judgements SET run_id = ${runId}::uuid
    WHERE id = ${judgementId}::uuid`)
}

export async function getTestJudgementRunId(
  judgementId: string,
): Promise<string | null | undefined> {
  const { rows } = await read<{ run_id: string | null }>(sql`/* getTestJudgementRunId */
    SELECT run_id FROM moderation_report_judgements WHERE id = ${judgementId}::uuid LIMIT 1`)
  return rows[0]?.run_id
}

export async function getTestAppealResolutionRunStatus(id: string): Promise<RunStatus | null> {
  const { rows } = await read<{ status: RunStatus }>(sql`/* getTestAppealResolutionRunStatus */
    SELECT status FROM moderation_appeal_resolution_runs WHERE id = ${id}::uuid LIMIT 1`)
  return rows[0]?.status ?? null
}
