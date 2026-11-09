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

const APPEAL_RESOLUTION_RUN_PREFIX = 'appeal_resolution_'

export function appealResolutionRunId(requestToken: string): string {
  return `${APPEAL_RESOLUTION_RUN_PREFIX}${requestToken}`
}

export function appealResolutionRequestToken(runId: string): string | null {
  if (!runId.startsWith(APPEAL_RESOLUTION_RUN_PREFIX)) return null
  const requestToken = runId.slice(APPEAL_RESOLUTION_RUN_PREFIX.length)
  return isUUID(requestToken) ? requestToken : null
}

export async function createAppealResolutionRun(
  query: QueryExecutor,
  appealId: string,
  requestToken?: string,
): Promise<string> {
  const { rows } = await query<{ id: string }>(sql`/* createAppealResolutionRun */
    INSERT INTO moderation_appeal_resolution_runs (id, moderation_appeal_id)
    SELECT COALESCE(${requestToken ?? null}::uuid, uuidv7()), appeal.id
    FROM moderation_appeals appeal
    WHERE appeal.id = ${appealId}::uuid
      AND appeal.approved_at IS NULL
      AND appeal.sent_at IS NULL
      AND appeal.resolved_at IS NULL
    RETURNING id
  `)
  assert(rows[0], 422, 'Appeal is no longer eligible for an AI rerun')
  return rows[0].id
}

/** Claims an admitted generation after queue acknowledgement or at worker start. */
export async function claimAppealResolutionRun(
  appealId: string,
  requestToken: string,
): Promise<boolean> {
  const { rows } = await write<{ id: string }>(sql`/* claimAppealResolutionRun */
    UPDATE moderation_appeals appeal
    SET ai_draft_request_token = ${requestToken}::uuid
    WHERE appeal.id = ${appealId}::uuid
      AND appeal.ai_draft_request_token <= ${requestToken}::uuid
      AND appeal.approved_at IS NULL
      AND appeal.sent_at IS NULL
      AND appeal.resolved_at IS NULL
      AND EXISTS (
        SELECT 1 FROM moderation_appeal_resolution_runs run
        WHERE run.id = ${requestToken}::uuid AND run.moderation_appeal_id = appeal.id
          AND run.status = 'active'
      )
    RETURNING appeal.id
  `)
  return rows.length === 1
}

export async function getAppealResolutionRunStatus(
  appealId: string,
  requestToken: string,
): Promise<AppealResolutionRunStatus | null> {
  return withPrimaryReads(async () => {
    const { rows } = await read<{ status: AppealResolutionRunStatus }>(sql`
      /* getAppealResolutionRunStatus */
      SELECT status
      FROM moderation_appeal_resolution_runs
      WHERE moderation_appeal_id = ${appealId}::uuid AND id = ${requestToken}::uuid
    `)
    return rows[0]?.status ?? null
  })
}

export async function getAppealResolutionRunOutcome(
  appealId: string,
  runId: string,
): Promise<AppealResolutionRunOutcome | null> {
  const requestToken = appealResolutionRequestToken(runId)
  if (!requestToken) return null

  const { rows } = await read<{
    status: AppealResolutionRunStatus
    result: { ai_drafted_at: string; latest_lifecycle_change_id: string } | null
  }>(sql`
    /* getAppealResolutionRunOutcome */
    SELECT status, result
    FROM moderation_appeal_resolution_runs
    WHERE moderation_appeal_id = ${appealId}::uuid AND id = ${requestToken}::uuid
  `)
  const row = rows[0]
  if (!row) return null
  return {
    run_id: runId,
    status: row.status,
    ai_drafted_at:
      row.status === 'succeeded' && row.result?.ai_drafted_at
        ? new Date(row.result.ai_drafted_at).toISOString()
        : null,
    latest_lifecycle_change_id:
      row.status === 'succeeded' ? (row.result?.latest_lifecycle_change_id ?? null) : null,
  }
}

/** The worker records terminal failures here, never intermediate retries. */
export async function markAppealResolutionRunFailed(
  appealId: string,
  requestToken: string,
): Promise<void> {
  await markAppealResolutionRunsFailed([{ appealId, requestToken }])
}

export async function markAppealResolutionRunsFailed(
  runs: readonly { appealId: string; requestToken: string }[],
): Promise<number> {
  if (runs.length === 0) return 0
  const uniqueRuns = [
    ...new Map(runs.map(run => [`${run.appealId}:${run.requestToken}`, run])).values(),
  ]
  const appealIds = uniqueRuns.map(run => run.appealId)
  const requestTokens = uniqueRuns.map(run => run.requestToken)
  const { rowCount } = await write(sql`/* markAppealResolutionRunsFailed */
    UPDATE moderation_appeal_resolution_runs run SET failed_at = now()
    FROM unnest(${appealIds}::uuid[], ${requestTokens}::uuid[]) AS requested(appeal_id, run_id)
    WHERE run.id = requested.run_id AND run.moderation_appeal_id = requested.appeal_id
      AND run.id = ANY(${requestTokens}::uuid[])
      AND run.completed_at IS NULL AND run.failed_at IS NULL AND run.expired_at IS NULL
    RETURNING run.id
  `)
  return rowCount ?? 0
}

/** Marks a worker's confirmed no-result completion, such as a superseded or ineligible run. */
export async function markAppealResolutionRunExpired(
  appealId: string,
  requestToken: string,
): Promise<void> {
  await write(sql`/* markAppealResolutionRunExpired */
    UPDATE moderation_appeal_resolution_runs
    SET expired_at = now()
    WHERE moderation_appeal_id = ${appealId}::uuid AND id = ${requestToken}::uuid
      AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL
    RETURNING id
  `)
}
