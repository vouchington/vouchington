import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'

export async function renameTotpAuthenticator(
  userId: string,
  authenticatorId: string,
  name: string,
): Promise<void> {
  assert(name.length >= 1 && name.length <= 100 && name.trim() === name, 422, 'Invalid name')

  await using query = await beginTransaction()
  await query(sql`/* renameTotpAuthenticator */ SELECT fn_lock_active_user_for_mutation(${userId})`)
  const result = await query(sql`/* renameTotpAuthenticator */
      UPDATE user_totp_authenticators
      SET name = ${name}
      WHERE id = ${authenticatorId} AND user_id = ${userId}
    `)
  await query.commit()
  const rowCount = result.rowCount
  assert(rowCount === 1, 404, 'Authenticator not found')
}
