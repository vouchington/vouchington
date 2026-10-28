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

/** Acquires the deletion writer fence without raising for an already-inactive subject. */
export async function lockUserSubjectMutationFences(
  query: TransactionQuery,
  userIds: readonly string[],
): Promise<void> {
  const distinctUserIds = [...new Set(userIds)].toSorted((left, right) => left.localeCompare(right))
  if (distinctUserIds.length === 0) return

  await query(sql`/* lockUserSubjectMutationFences */
    SELECT pg_advisory_xact_lock(hashtextextended(ordered.user_id::text, 0))
    FROM (
      SELECT unnest(${distinctUserIds}::uuid[]) AS user_id
      ORDER BY user_id
    ) ordered
  `)
}
