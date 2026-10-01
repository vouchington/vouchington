import { beginTransaction } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'

async function runInTransaction(statement: SQLStatement): Promise<{ id?: string }[]> {
  await using query = await beginTransaction()
  const { rows } = await query<{ id?: string }>(statement)
  await query.commit()
  return rows
}

/** Inserts a hold directly so schema tests can exercise constraints the service never violates. */
export async function insertPreservationHoldForTest(
  accountUserId: string,
  placedById: string,
  referenceCiphertext = 'cipher',
): Promise<string> {
  const rows = await runInTransaction(sql`/* insertTestPreservationHold */
    INSERT INTO user_legal_preservation_holds (account_user_id, placed_by_id, reference_ciphertext)
    VALUES (${accountUserId}, ${placedById}, ${referenceCiphertext}) RETURNING id`)
  return rows[0]!.id!
}

export async function releasePreservationHoldForTest(
  holdId: string,
  releasedById: string,
): Promise<void> {
  await runInTransaction(sql`/* releaseTestPreservationHold */
    UPDATE user_legal_preservation_holds
    SET released_at = CURRENT_TIMESTAMP, released_by_id = ${releasedById} WHERE id = ${holdId}`)
}

export async function stampPreservationHoldReleasedAtOnlyForTest(holdId: string): Promise<void> {
  await runInTransaction(sql`/* stampTestPreservationHoldReleasedAtOnly */
    UPDATE user_legal_preservation_holds SET released_at = CURRENT_TIMESTAMP WHERE id = ${holdId}`)
}

export async function reopenPreservationHoldForTest(holdId: string): Promise<void> {
  await runInTransaction(sql`/* reopenTestPreservationHold */
    UPDATE user_legal_preservation_holds
    SET released_at = NULL, released_by_id = NULL WHERE id = ${holdId}`)
}

export async function replacePreservationHoldCiphertextForTest(
  holdId: string,
  referenceCiphertext: string,
): Promise<void> {
  await runInTransaction(sql`/* replaceTestPreservationHoldCiphertext */
    UPDATE user_legal_preservation_holds
    SET reference_ciphertext = ${referenceCiphertext} WHERE id = ${holdId}`)
}

export async function deletePreservationHoldForTest(holdId: string): Promise<void> {
  await runInTransaction(sql`/* deleteTestPreservationHold */
    DELETE FROM user_legal_preservation_holds WHERE id = ${holdId}`)
}
