import type { TransactionQuery } from '@data-stores/psql/types'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'

export type NativeLinkUserState = 'active' | 'missing' | 'suspended'

export async function getActiveNativeLinkUserState(
  userId: string,
  query: TransactionQuery,
): Promise<NativeLinkUserState> {
  const { rows } = await query<{ suspended: boolean }>(sql`/* getActiveNativeLinkUser */
    SELECT EXISTS (
      SELECT 1 FROM user_suspensions
      WHERE user_id = users.id AND lifted_at IS NULL
    ) AS suspended
    FROM users
    WHERE id = ${userId} AND deleted_at IS NULL
    FOR UPDATE OF users`)
  if (!rows[0]) return 'missing'
  return rows[0].suspended ? 'suspended' : 'active'
}

export function assertActiveNativeLinkUserState(
  state: NativeLinkUserState,
): asserts state is 'active' {
  if (state === 'missing') throw createHttpError(404, 'Voucha user not found')
  if (state === 'suspended') {
    throw createCodedError(403, 'Your account has been suspended', ACCOUNT_SUSPENDED)
  }
}
