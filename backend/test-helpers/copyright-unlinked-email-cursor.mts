import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Read the reserved unlinked intake cursor to prove an aborted page made no progress. */
export async function readCopyrightUnlinkedEmailOperationalCursor(): Promise<{
  cursor_record_id: string | null
  sweep_upper_bound_record_id: string | null
  cursor_phase: string | null
  cursor_edge_id: string | null
}> {
  const { rows } = await read<{
    cursor_record_id: string | null
    sweep_upper_bound_record_id: string | null
    cursor_phase: string | null
    cursor_edge_id: string | null
  }>(sql`/* readCopyrightUnlinkedEmailOperationalCursor */
    SELECT cursor_record_id, sweep_upper_bound_record_id, cursor_phase, cursor_edge_id
    FROM copyright_notice_operational_retention_cursors
    WHERE kind = 'unlinked_email_intakes'`)
  if (!rows[0]) throw new Error('Reserved unlinked copyright email cursor was not found')
  return rows[0]
}
