import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function lockActiveUserSubjectsForMutation(
  query: TransactionQuery,
  userIds: readonly string[],
): Promise<void> {
  const distinctUserIds = [...new Set(userIds)].toSorted((left, right) => left.localeCompare(right))
  if (distinctUserIds.length === 0) return

  await query(sql`/* lockActiveUserSubjectsForMutation */
    SELECT fn_lock_active_user_for_mutation(ordered.user_id)
    FROM (
      SELECT unnest(${distinctUserIds}::uuid[]) AS user_id
      ORDER BY user_id
    ) ordered
  `)
}

/**
 * Takes `FOR SHARE` on the users rows in one id-ordered statement and returns the ones still
 * active. Deletion locks the same row `FOR NO KEY UPDATE`, so it waits for this transaction and a
 * waiter that resumes after deletion sees the committed `deleted_at`. Unlike
 * `fn_lock_active_user_for_mutation`, deleted or missing users are reported, not raised.
 */
export async function lockUsersForShare(
  query: TransactionQuery,
  userIds: readonly string[],
): Promise<Set<string>> {
  const distinctUserIds = [...new Set(userIds)].toSorted((left, right) => left.localeCompare(right))
  if (distinctUserIds.length === 0) return new Set()

  const { rows } = await query<{ id: string; active: boolean }>(sql`/* lockUsersForShare */
    SELECT id, deleted_at IS NULL AS active
    FROM users
    WHERE id = ANY(${distinctUserIds}::uuid[])
    ORDER BY id
    FOR SHARE
  `)
  const activeUserIds = new Set<string>()
  for (const row of rows) if (row.active) activeUserIds.add(row.id)
  return activeUserIds
}
