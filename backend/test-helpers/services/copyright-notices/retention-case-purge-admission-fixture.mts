import { encryptSecret } from '@modules/token-secrets'
import { v7 as uuidv7 } from 'uuid'
import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Models the crash boundary after the live case was deleted but its retained owner remained. */
export async function insertCopyrightPurgeOrphanForTest(noticeId: string): Promise<void> {
  await write(sql`/* insertCopyrightPurgeOrphanForTest */
    INSERT INTO retained_copyright_notice_identities (id, case_deleted_at)
    VALUES (${noticeId}::uuid, clock_timestamp())`)
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

/** A committed account hold and its natural party-clock signal for admission/clock subjects. */
export async function seedCopyrightPurgeAccountHold(accountId: string, actorId: string) {
  const id = uuidv7()
  const ciphertext = encryptSecret('Owned admission fixture.', `user-legal-preservation-hold:${id}`)
  await using query = await beginTransaction()
  const { rows } = await query<{ placed_at: Date }>(sql`/* seedCopyrightPurgeAccountHold */
    WITH placed AS (
      INSERT INTO user_legal_preservation_holds (id, account_user_id, placed_by_id, reference_ciphertext)
      VALUES (${id}, ${accountId}, ${actorId}, ${ciphertext}) RETURNING created_at
    ), marked AS (
      UPDATE retained_user_identities identity SET is_copyright_case_clock_sync_pending =
        identity.is_copyright_case_clock_sync_pending OR EXISTS (
          SELECT 1 FROM copyright_notice_party_identities party WHERE party.account_user_id = identity.id)
      WHERE identity.id = ${accountId} RETURNING id
    ) SELECT placed.created_at AS placed_at FROM placed CROSS JOIN marked`)
  if (!rows[0]) throw new Error('Owned hold account is missing')
  await query.commit()
  return { id, placed_at: rows[0].placed_at }
}
