import type { CopyrightOperationalScope } from '../services/copyright-notices/operational-retention-cursor.mts'

/** Observe only this owned pass's committed pagination progress. */
export function readCopyrightOrphanTokenCursor(scope: CopyrightOperationalScope): Promise<{
  cursor_record_id: string | null
  sweep_upper_bound_record_id: string | null
}> {
  const { cursor_record_id, sweep_upper_bound_record_id } = scope.cursor
  return Promise.resolve({ cursor_record_id, sweep_upper_bound_record_id })
}
