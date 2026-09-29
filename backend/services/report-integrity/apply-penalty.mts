import { beginTransaction } from '@data-stores/psql'
import onError from '@modules/on-error'
import { markJwtStaleBatch } from '@services/jwt-session/invalidation'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import { FLAG_COLUMNS } from './flag-columns.mts'
import { getReportIntegrityFlagByIdFromPrimary } from './get-flags.mts'
import type { ReportIntegrityFlag } from './create-flag.mts'

export type AppliedReportAbusePenalty = {
  id: string
  user_id: string
}

export type ApplyReportAbusePenaltyResult = {
  flag: ReportIntegrityFlag
  penalized_user_count: number
  /** Created penalty rows, so callers can surface revocable penalty IDs. */
  penalties: AppliedReportAbusePenalty[]
}

/**
 * Resolve a flag as `penalized` and penalize exactly the reporters captured at
 * detection time (the `report_integrity_flag_reporters` rows). Resolution and penalty
 * insertion happen in a single transaction guarded by `resolved_at IS NULL`, so a
 * concurrently dismissed/resolved flag never gets penalties applied, and the penalty
 * set never includes later/unrelated reporters.
 */
export async function applyReportAbusePenalty(
  currentUserId: string,
  flagId: string,
): Promise<ApplyReportAbusePenaltyResult> {
  const flag = await getReportIntegrityFlagByIdFromPrimary(flagId)
  if (!flag) throw createHttpError(404, 'Report integrity flag not found')

  await using query = await beginTransaction()
  const result = await applyPenaltyInTransaction()
  await query.commit()

  // Fire-and-forget: invalidate the JWT tt claim for each penalized user so
  // computeTrustTier picks up the penalty on the next session cold-path refresh.
  if (result.penalties.length > 0) {
    invalidateSessionsAsync(result.penalties.map(p => p.user_id))
  }

  return {
    flag: result.flag,
    penalized_user_count: result.penalties.length,
    penalties: result.penalties,
  }

  async function applyPenaltyInTransaction(): Promise<{
    flag: ReportIntegrityFlag
    penalties: AppliedReportAbusePenalty[]
  }> {
    // Atomically claim the flag as penalized. If another admin already resolved it
    // (e.g. dismissed), this affects 0 rows and we abort without applying penalties.
    const { rows: resolvedRows } = await query(
      sql`/* applyReportAbusePenalty_resolveFlag */
      UPDATE report_integrity_flags
      SET resolved_at = NOW(), resolved_by_id = ${currentUserId}, resolution = 'penalized'
      WHERE id = ${flagId}
        AND resolved_at IS NULL
      RETURNING`.append(FLAG_COLUMNS),
    )
    const resolvedFlag = resolvedRows[0] as ReportIntegrityFlag | undefined
    if (!resolvedFlag) throw createHttpError(409, 'Flag is already resolved')

    // Insert penalty records for the detection-time reporter set. A reporter hard-deleted
    // since detection has already left the set (CASCADE), so one deleted account does not
    // fail the whole batch; ON CONFLICT skips users already penalized from this flag.
    const { rows: insertedRows } = await query(sql`/* applyReportAbusePenalty_insertPenalties */
      INSERT INTO report_abuse_penalties (user_id, reason, source_flag_id, created_by_id)
      SELECT reporter.user_id, 'mass_report_campaign', ${flagId}::uuid, ${currentUserId}::uuid
      FROM report_integrity_flag_reporters reporter
      WHERE reporter.flag_id = ${flagId}
      ORDER BY reporter.user_id
      ON CONFLICT (user_id, source_flag_id)
        WHERE source_flag_id IS NOT NULL AND revoked_at IS NULL
      DO NOTHING
      RETURNING id, user_id
    `)

    const inserted = insertedRows as AppliedReportAbusePenalty[]
    if (inserted.length === 0) return { flag: resolvedFlag, penalties: inserted }

    // Stamp bad_faith_reporter_at on users who don't already have one set.
    await query(sql`/* applyReportAbusePenalty_stampUsers */
      UPDATE users
      SET bad_faith_reporter_at = NOW()
      WHERE id = ANY(${inserted.map(p => p.user_id)}::uuid[])
        AND bad_faith_reporter_at IS NULL
    `)

    return { flag: resolvedFlag, penalties: inserted }
  }
}

function invalidateSessionsAsync(userIds: string[]): void {
  void markJwtStaleBatch(userIds).catch(onError)
}
