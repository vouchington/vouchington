import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * Serializes export transitions with user deletion and returns the owners that remain active.
 * The locks deliberately precede the lifecycle read, in one statement ordered by user id:
 * otherwise deletion could commit between an active-user read and the export transition it is
 * meant to fence, and concurrent batches could take the same locks in different orders.
 */
export async function lockActiveDataRequestUsers(
  query: TransactionQuery,
  userIds: readonly string[],
): Promise<Set<string>> {
  const sortedIds = [...new Set(userIds)].toSorted()
  if (sortedIds.length === 0) return new Set()
  await query(sql`/* lockActiveDataRequestUser:lock */
    SELECT pg_advisory_xact_lock(hashtextextended(lock_key.user_id, 0))
    FROM unnest(${sortedIds}::text[]) WITH ORDINALITY AS lock_key(user_id, position)
    ORDER BY lock_key.position
  `)
  const { rows } = await query<{ id: string }>(sql`/* lockActiveDataRequestUser:check */
    SELECT id FROM users WHERE id = ANY(${sortedIds}::uuid[]) AND deleted_at IS NULL
  `)
  return new Set(rows.map(row => row.id))
}

export async function lockActiveDataRequestUser(
  query: TransactionQuery,
  userId: string,
): Promise<boolean> {
  return (await lockActiveDataRequestUsers(query, [userId])).has(userId)
}
