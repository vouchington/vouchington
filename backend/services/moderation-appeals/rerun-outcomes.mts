import { read, withPrimaryReads, write } from '@data-stores/psql'
import type { QueryExecutor } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import assert from 'http-assert'
import sql from 'sql-template-strings'

export type AppealResolutionRunStatus = 'active' | 'succeeded' | 'failed' | 'expired'

export type AppealResolutionRunOutcome = {
  run_id: string
  status: AppealResolutionRunStatus
  ai_drafted_at: string | null
  latest_lifecycle_change_id: string | null
}

/**
 * Admits one AI draft request for an eligible appeal. The run row id is the request identity and
 * the queue job's run id. A manual rerun claims it after queue acknowledgement; an automatic
 * request claims it in the same statement, so the appeal never references a run it has not seen.
 */
export async function createAppealResolutionRun(
  query: QueryExecutor,
  appealId: string,
  options: { runId?: string; claim?: boolean } = {},
): Promise<string> {
  const { rows } = await query<{ id: string }>(sql`/* createAppealResolutionRun */
    WITH inserted AS (
      INSERT INTO moderation_appeal_resolution_runs (id, moderation_appeal_id)
      SELECT COALESCE(${options.runId ?? null}::uuid, uuidv7()), appeal.id
      FROM moderation_appeals appeal
      WHERE appeal.id = ${appealId}::uuid
        AND appeal.approved_at IS NULL
        AND appeal.sent_at IS NULL
        AND appeal.resolved_at IS NULL
      RETURNING id, moderation_appeal_id
    ), requested AS (
      UPDATE moderation_appeals appeal
      SET ai_draft_requested_run_id = inserted.id
      FROM inserted
      WHERE ${options.claim === true} AND appeal.id = inserted.moderation_appeal_id
      RETURNING appeal.id
    )
    SELECT id FROM inserted
  `)
  assert(rows[0], 422, 'Appeal is no longer eligible for an AI rerun')
  return rows[0].id
}

/** Claims an admitted generation after queue acknowledgement or at worker start. */
export async function claimAppealResolutionRun(appealId: string, runId: string): Promise<boolean> {
  const { rows } = await write<{ id: string }>(sql`/* claimAppealResolutionRun */
    UPDATE moderation_appeals appeal
    SET ai_draft_requested_run_id = ${runId}::uuid
    WHERE appeal.id = ${appealId}::uuid
      AND (appeal.ai_draft_requested_run_id IS NULL OR appeal.ai_draft_requested_run_id <= ${runId}::uuid)
      AND appeal.approved_at IS NULL
      AND appeal.sent_at IS NULL
      AND appeal.resolved_at IS NULL
      AND EXISTS (
        SELECT 1 FROM moderation_appeal_resolution_runs run
        WHERE run.id = ${runId}::uuid AND run.moderation_appeal_id = appeal.id
          AND run.status = 'active'
      )
    RETURNING appeal.id
  `)
  return rows.length === 1
}

export async function getAppealResolutionRunStatus(
  appealId: string,
  runId: string,
): Promise<AppealResolutionRunStatus | null> {
  return withPrimaryReads(async () => {
    const { rows } = await read<{ status: AppealResolutionRunStatus }>(sql`
      /* getAppealResolutionRunStatus */
      SELECT status
      FROM moderation_appeal_resolution_runs
      WHERE moderation_appeal_id = ${appealId}::uuid AND id = ${runId}::uuid
    `)
    return rows[0]?.status ?? null
  })
}

export async function getAppealResolutionRunOutcome(
  appealId: string,
  runId: string,
): Promise<AppealResolutionRunOutcome | null> {
  if (!isUUID(runId)) return null

  const { rows } = await read<{
    status: AppealResolutionRunStatus
    ai_drafted_at: Date | null
    latest_lifecycle_change_id: string | null
  }>(sql`
    /* getAppealResolutionRunOutcome */
    SELECT status, ai_drafted_at, latest_lifecycle_change_id
    FROM moderation_appeal_resolution_runs
    WHERE moderation_appeal_id = ${appealId}::uuid AND id = ${runId}::uuid
  `)
  const row = rows[0]
  if (!row) return null
  return {
    run_id: runId,
    status: row.status,
    ai_drafted_at:
      row.status === 'succeeded' && row.ai_drafted_at ? row.ai_drafted_at.toISOString() : null,
    latest_lifecycle_change_id: row.status === 'succeeded' ? row.latest_lifecycle_change_id : null,
  }
}

/** The worker records terminal failures here, never intermediate retries. */
export async function markAppealResolutionRunFailed(
  appealId: string,
  runId: string,
): Promise<void> {
  await markAppealResolutionRunsFailed([{ appealId, runId }])
}

export async function markAppealResolutionRunsFailed(
  runs: readonly { appealId: string; runId: string }[],
): Promise<number> {
  if (runs.length === 0) return 0
  const uniqueRuns = [...new Map(runs.map(run => [`${run.appealId}:${run.runId}`, run])).values()]
  const appealIds = uniqueRuns.map(run => run.appealId)
  const runIds = uniqueRuns.map(run => run.runId)
  const { rowCount } = await write(sql`/* markAppealResolutionRunsFailed */
    UPDATE moderation_appeal_resolution_runs run SET failed_at = now()
    FROM unnest(${appealIds}::uuid[], ${runIds}::uuid[]) AS requested(appeal_id, run_id)
    WHERE run.id = requested.run_id AND run.moderation_appeal_id = requested.appeal_id
      AND run.id = ANY(${runIds}::uuid[])
      AND run.completed_at IS NULL AND run.failed_at IS NULL AND run.expired_at IS NULL
    RETURNING run.id
  `)
  return rowCount ?? 0
}

/** Marks a worker's confirmed no-result completion, such as a superseded or ineligible run. */
export async function markAppealResolutionRunExpired(
  appealId: string,
  runId: string,
): Promise<void> {
  await write(sql`/* markAppealResolutionRunExpired */
    UPDATE moderation_appeal_resolution_runs
    SET expired_at = now()
    WHERE moderation_appeal_id = ${appealId}::uuid AND id = ${runId}::uuid
      AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL
    RETURNING id
  `)
}
