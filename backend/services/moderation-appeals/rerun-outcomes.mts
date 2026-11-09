import { read, withPrimaryReads, write } from '@data-stores/psql'
import type { QueryExecutor } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
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
  requestToken: string,
): Promise<void> {
  await query(sql`/* createAppealResolutionRun */
    INSERT INTO moderation_appeal_resolution_runs (id, moderation_appeal_id)
    VALUES (${requestToken}::uuid, ${appealId}::uuid)
    RETURNING id
  `)
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
  await write(sql`/* markAppealResolutionRunFailed */
    UPDATE moderation_appeal_resolution_runs
    SET failed_at = now()
    WHERE moderation_appeal_id = ${appealId}::uuid AND id = ${requestToken}::uuid
      AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL
    RETURNING id
  `)
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
