import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type GooglePlayRecoveryCursor = {
  previousCursor: string | null
  previousUpperBound: string | null
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
  const { rows } = await write<{
    last_evidence_id: string | null
    sweep_upper_bound_id: string | null
  }>(sql`/* beginGooglePlayRecoverySweep */
    SELECT last_evidence_id, sweep_upper_bound_id
    FROM membership_google_play_recovery_cursors WHERE id = ${options.cursorId}`)
  const previousCursor = rows[0]?.last_evidence_id ?? null
  const previousUpperBound = rows[0]?.sweep_upper_bound_id ?? null
  return {
    previousCursor,
    previousUpperBound,
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
  nextCursor: string | null
  completesSweep: boolean
  sweepUpperBound: string | null
}): Promise<void> {
  if (!options.sweepUpperBound || (!options.nextCursor && !options.completesSweep)) return
  const lastEvidenceId = options.completesSweep ? null : options.nextCursor
  const sweepUpperBoundId = options.completesSweep ? null : options.sweepUpperBound
  await write(sql`/* advanceGooglePlayRecoverySweep */
    INSERT INTO membership_google_play_recovery_cursors (
      id, last_evidence_id, sweep_upper_bound_id
    ) VALUES (${options.cursorId}, ${lastEvidenceId}::UUID, ${sweepUpperBoundId}::UUID)
    ON CONFLICT (id) DO UPDATE
      SET last_evidence_id = EXCLUDED.last_evidence_id,
        sweep_upper_bound_id = EXCLUDED.sweep_upper_bound_id,
        updated_at = CURRENT_TIMESTAMP
      WHERE membership_google_play_recovery_cursors.last_evidence_id
          IS NOT DISTINCT FROM ${options.previousCursor}::UUID
        AND membership_google_play_recovery_cursors.sweep_upper_bound_id
          IS NOT DISTINCT FROM ${options.previousUpperBound}::UUID`)
}
