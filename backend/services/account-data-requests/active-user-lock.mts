import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * Serializes an export transition with user deletion and reports whether the owner remains active.
 * The lock deliberately precedes the lifecycle read: otherwise deletion could commit between an
 * active-user read and the export transition it is meant to fence.
 */
export async function lockActiveDataRequestUser(
  query: TransactionQuery,
  userId: string,
): Promise<boolean> {
  await query(sql`/* lockActiveDataRequestUser:lock */
    SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))
  `)
  const { rows } = await query<{ active: boolean }>(sql`/* lockActiveDataRequestUser:check */
    SELECT EXISTS (
      SELECT 1 FROM users WHERE id = ${userId} AND deleted_at IS NULL
    ) AS active
  `)
  return rows[0]?.active ?? false
}
