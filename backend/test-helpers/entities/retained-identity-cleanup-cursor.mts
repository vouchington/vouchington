import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Probe the finite cursor family inside a transaction that rolls back on return. */
export async function canStoreCopyrightNoticeCleanupCursorForTest(): Promise<boolean> {
  await using query = await beginTransaction()
  await query(sql`/* canStoreCopyrightNoticeCleanupCursorForTest:insert */
    INSERT INTO retained_identity_cleanup_cursors (family)
    VALUES ('copyright_notice') ON CONFLICT DO NOTHING
  `)
  const { rows } = await query<{
    family: string
  }>(sql`/* canStoreCopyrightNoticeCleanupCursorForTest:read */
    SELECT family FROM retained_identity_cleanup_cursors WHERE family = 'copyright_notice'
  `)
  return rows[0]?.family === 'copyright_notice'
}
