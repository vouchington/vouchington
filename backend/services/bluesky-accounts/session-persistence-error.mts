import type { TransactionQuery } from '@data-stores/psql/types'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'

export async function throwBlueskySessionPersistenceError(
  userId: string,
  did: string,
  query: TransactionQuery,
): Promise<never> {
  const { rows } = await query<{
    exists: boolean
    suspended: boolean
  }>(sql`/* throwBlueskySessionPersistenceError */
    SELECT
      EXISTS (SELECT 1 FROM users WHERE id = ${userId} AND deleted_at IS NULL) AS exists,
      EXISTS (
        SELECT 1 FROM user_suspensions
        WHERE user_id = ${userId} AND lifted_at IS NULL
      ) AS suspended`)
  if (!rows[0]?.exists) throw createHttpError(404, 'Voucha user not found')
  if (rows[0].suspended) {
    throw createCodedError(403, 'Your account has been suspended', ACCOUNT_SUSPENDED)
  }
  throw createHttpError(409, `The Bluesky session for ${did} belongs to another lifecycle`)
}
