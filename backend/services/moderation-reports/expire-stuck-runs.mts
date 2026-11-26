import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { markReportJudgementRunsExpired } from './rerun-outcomes.mts'

/**
 * Expires one page of active report judgement runs older than `cutoffId` (a UUIDv7 bound computed
 * once per sweep). This is the SQL recovery for a run whose job crashed or stalled past its limit
 * before the worker could persist the failure. The page is read from the primary so a run expired
 * by the previous page never returns, and the expire is conditional, so a run that finished
 * meanwhile is left alone. Returns the rows read: a full page means another page may follow.
 * `runIds` only scopes a test to rows it owns.
 */
export async function expireStuckReportJudgementRunPage(
  cutoffId: string,
  batchSize: number,
  runIds?: readonly string[],
): Promise<number> {
  const query = sql`/* listStuckReportJudgementRuns */
    SELECT id, moderation_report_id
    FROM moderation_report_judgement_runs
    WHERE id < ${cutoffId}::uuid
      AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL`
  if (runIds) query.append(sql` AND id = ANY(${runIds}::uuid[])`)
  query.append(sql` ORDER BY id LIMIT ${batchSize}`)
  const { rows } = await write<{ id: string; moderation_report_id: string }>(query)
  await markReportJudgementRunsExpired(
    rows.map(row => ({ reportId: row.moderation_report_id, runId: row.id })),
  )
  return rows.length
}
