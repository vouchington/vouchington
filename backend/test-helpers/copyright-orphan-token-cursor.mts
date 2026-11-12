import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Observe the reserved token cursor before and after a failed bounded page. */
export async function readCopyrightOrphanTokenCursor(): Promise<{
  cursor_record_id: string | null
  sweep_upper_bound_record_id: string | null
}> {
  const { rows } = await read<{
    cursor_record_id: string | null
    sweep_upper_bound_record_id: string | null
  }>(sql`/* readCopyrightOrphanTokenCursor */
    SELECT cursor_record_id, sweep_upper_bound_record_id
    FROM copyright_notice_operational_retention_cursors
    WHERE kind = 'orphan_email_thread_tokens'`)
  if (!rows[0]) throw new Error('Reserved orphan token cursor was not found')
  return rows[0]
}
