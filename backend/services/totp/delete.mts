import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'

export async function deleteTotpAuthenticator(
  userId: string,
  authenticatorId: string,
  lockedUserTransaction?: TransactionQuery,
): Promise<void> {
  const run = async (query: TransactionQuery) => {
    const result = await query(sql`/* deleteTotpAuthenticator */
      DELETE FROM user_totp_authenticators
      WHERE id = ${authenticatorId} AND user_id = ${userId}
    `)
    return result.rowCount
  }
  let rowCount: number | null
  // MFA protection already holds the active-user fence and all factor row locks.
  if (lockedUserTransaction) {
    rowCount = await run(lockedUserTransaction)
  } else {
    await using query = await beginTransaction()
    await query(
      sql`/* deleteTotpAuthenticator */ SELECT fn_lock_active_user_for_mutation(${userId})`,
    )
    rowCount = await run(query)
    await query.commit()
  }
  assert(rowCount === 1, 404, 'Authenticator not found')
}
