import type { CopyrightOperationalScope } from '../services/copyright-notices/operational-retention-cursor.mts'

/** Observe only this owned pass's committed pagination progress. */
export function readCopyrightUnlinkedEmailOperationalCursor(
  scope: CopyrightOperationalScope,
): Promise<{
  cursor_record_id: string | null
  sweep_upper_bound_record_id: string | null
  cursor_phase: string | null
  cursor_edge_id: string | null
}> {
  const { cursor_record_id, sweep_upper_bound_record_id, cursor_phase, cursor_edge_id } =
    scope.cursor
  return Promise.resolve({
    cursor_record_id,
    sweep_upper_bound_record_id,
    cursor_phase,
    cursor_edge_id,
  })
}
