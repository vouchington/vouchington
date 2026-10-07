import { beginTransaction, read } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import { decryptSecret } from '@modules/token-secrets'
import type { UserPreservationHold } from '../../services/users/preservation-holds.mts'

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

export async function readPreservationHoldsForTest(
  userId: string,
): Promise<UserPreservationHold[]> {
  const { rows } = await read<{
    id: string
    account_user_id: string
    placed_by_id: string
    reference_ciphertext: string
    released_at: Date | null
    released_by_id: string | null
    created_at: Date
  }>(sql`
    SELECT id, account_user_id, placed_by_id, reference_ciphertext,
      released_at, released_by_id, created_at
    FROM user_legal_preservation_holds
    WHERE account_user_id = ${userId}
    ORDER BY id DESC
  `)
  return rows.map(row => ({
    id: row.id,
    account_user_id: row.account_user_id,
    reference: decryptSecret(row.reference_ciphertext, `user-legal-preservation-hold:${row.id}`),
    placed_by_id: row.placed_by_id,
    placed_at: row.created_at,
    released_by_id: row.released_by_id,
    released_at: row.released_at,
  }))
}
