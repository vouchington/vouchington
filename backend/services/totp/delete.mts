import { beginTransaction, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'

export async function deleteTotpAuthenticator(
  userId: string,
  authenticatorId: string,
  opts?: QueryOptions,
): Promise<void> {
  const run = async (query: NonNullable<QueryOptions['query']>) => {
    await query(
      sql`/* deleteTotpAuthenticator */ SELECT fn_lock_active_user_for_mutation(${userId})`,
    )
    const result = await query(sql`/* deleteTotpAuthenticator */
      DELETE FROM user_totp_authenticators
      WHERE id = ${authenticatorId} AND user_id = ${userId}
    `)
    return result.rowCount
  }
  let rowCount: number | null
  if (opts?.query) {
    rowCount = await run(opts.query)
  } else {
    await using query = await beginTransaction()
    rowCount = await run(query)
    await query.commit()
  }
  assert(rowCount === 1, 404, 'Authenticator not found')
}
