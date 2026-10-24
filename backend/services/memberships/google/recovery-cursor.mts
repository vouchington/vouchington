import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type GooglePlayRecoveryCursor = {
  previousCursor: string | null
  previousUpperBound: string | null
  previousRevision: string
  sweepUpperBound: string | null
}

export type GooglePlayRecoveryPage<T> = GooglePlayRecoveryCursor & {
  items: T[]
  nextCursor: string | null
  completesSweep: boolean
}

export async function beginGooglePlayRecoverySweep(options: {
  cursorId: 'active_sources' | 'notifications' | 'acknowledgements'
  findUpperBound: () => Promise<string | null>
}): Promise<GooglePlayRecoveryCursor> {
  await write(sql`/* ensureGooglePlayRecoveryCursor */
    INSERT INTO membership_google_play_recovery_cursors (recovery_sweep)
    VALUES (${options.cursorId}) ON CONFLICT DO NOTHING`)
  const { rows } = await write<{
    cursor_evidence_id: string | null
    sweep_upper_bound_evidence_id: string | null
    revision: string
  }>(sql`/* beginGooglePlayRecoverySweep */
    SELECT cursor_evidence_id, sweep_upper_bound_evidence_id, revision::text
    FROM membership_google_play_recovery_cursors WHERE recovery_sweep = ${options.cursorId}`)
  const previousCursor = rows[0]?.cursor_evidence_id ?? null
  const previousUpperBound = rows[0]?.sweep_upper_bound_evidence_id ?? null
  return {
    previousCursor,
    previousUpperBound,
    previousRevision: rows[0]!.revision,
    sweepUpperBound: previousUpperBound ?? (await options.findUpperBound()),
  }
}

export function pageGooglePlayRecoveryItems<T extends { id: string }>(
  cursor: GooglePlayRecoveryCursor,
  rows: T[],
  batchSize: number,
): GooglePlayRecoveryPage<T> {
  const items = rows.slice(0, batchSize)
  return {
    ...cursor,
    items,
    nextCursor: items.at(-1)?.id ?? null,
    completesSweep: rows.length <= batchSize,
  }
}

export async function advanceGooglePlayRecoverySweep(options: {
  cursorId: 'active_sources' | 'notifications' | 'acknowledgements'
  previousCursor: string | null
  previousUpperBound: string | null
  previousRevision: string
  nextCursor: string | null
  completesSweep: boolean
  sweepUpperBound: string | null
}): Promise<boolean> {
  if (!options.sweepUpperBound || (!options.nextCursor && !options.completesSweep)) return false
  const lastEvidenceId = options.completesSweep ? null : options.nextCursor
  const sweepUpperBoundId = options.completesSweep ? null : options.sweepUpperBound
  const { rowCount } = await write(sql`/* advanceGooglePlayRecoverySweep */
    UPDATE membership_google_play_recovery_cursors
    SET cursor_evidence_id = ${lastEvidenceId}::UUID,
        sweep_upper_bound_evidence_id = ${sweepUpperBoundId}::UUID,
        revision = revision + 1
    WHERE recovery_sweep = ${options.cursorId}
      AND revision = ${options.previousRevision}::BIGINT
      AND cursor_evidence_id IS NOT DISTINCT FROM ${options.previousCursor}::UUID
      AND sweep_upper_bound_evidence_id IS NOT DISTINCT FROM ${options.previousUpperBound}::UUID`)
  return rowCount === 1
}
