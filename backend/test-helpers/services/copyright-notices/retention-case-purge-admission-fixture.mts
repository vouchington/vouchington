import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Models the crash boundary after the live case was deleted but its retained owner remained. */
export async function insertCopyrightPurgeOrphanForTest(noticeId: string): Promise<void> {
  await write(sql`/* insertCopyrightPurgeOrphanForTest */
    INSERT INTO retained_copyright_notice_identities (id) VALUES (${noticeId}::uuid)`)
}

export async function deleteCopyrightPurgeOrphanForTest(noticeId: string): Promise<void> {
  await write(sql`/* deleteCopyrightPurgeOrphanForTest */
    DELETE FROM retained_copyright_notice_identities WHERE id = ${noticeId}::uuid`)
}

export async function readCopyrightCaseClocksForTest(
  noticeIds: readonly string[],
): Promise<Date[]> {
  const { rows } = await read<{ id: string; last_legal_activity_at: Date }>(sql`
    /* readCopyrightCaseClocksForTest */
    SELECT id, last_legal_activity_at FROM copyright_notices
    WHERE id = ANY(${[...noticeIds]}::uuid[]) ORDER BY id`)
  return rows.map(row => row.last_legal_activity_at)
}
