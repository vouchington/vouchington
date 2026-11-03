import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** The stored legal clock that retention reads, for tests that prove a writer advanced it. */
export async function readCopyrightLegalClockForTest(noticeId: string): Promise<Date> {
  const { rows } = await read<{ at: Date }>(sql`
    /* readCopyrightLegalClockForTest */
    SELECT last_legal_activity_at AS at FROM copyright_notices WHERE id = ${noticeId}::uuid`)
  if (!rows[0]) throw new Error('Copyright notice is missing')
  return rows[0].at
}
