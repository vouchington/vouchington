import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function lockTestUserMutation(query: TransactionQuery, userId: string): Promise<void> {
  await query(sql`/* lockTestUserMutation */ SELECT fn_lock_active_user_for_mutation(${userId})`)
}

export async function lockTestUserRowForUpdate(
  query: TransactionQuery,
  userId: string,
): Promise<void> {
  await query(sql`/* lockTestUserRowForUpdate */
    SELECT id FROM users WHERE id = ${userId} FOR UPDATE
  `)
}

/** Whether another connection cannot take `FOR SHARE` on the users row right now. */
export async function userRowShareLockIsBlockedForTest(userId: string): Promise<boolean> {
  await using query = await beginTransaction()
  try {
    await query(sql`/* userRowShareLockIsBlockedForTest */
      SELECT id FROM users WHERE id = ${userId} FOR SHARE NOWAIT
    `)
    return false
  } catch (err) {
    if ((err as { code?: string }).code === '55P03') return true
    throw err
  }
}
