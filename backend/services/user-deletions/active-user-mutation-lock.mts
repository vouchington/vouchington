import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function lockActiveUserSubjectsForMutation(
  query: TransactionQuery,
  userIds: readonly string[],
): Promise<void> {
  const distinctUserIds = [...new Set(userIds)].sort((left, right) => left.localeCompare(right))
  if (distinctUserIds.length === 0) return

  await query(sql`/* lockActiveUserSubjectsForMutation */
    SELECT fn_lock_active_user_for_mutation(ordered.user_id)
    FROM (
      SELECT unnest(${distinctUserIds}::uuid[]) AS user_id
      ORDER BY user_id
    ) ordered
  `)
}
