import type { TransactionQuery } from '@data-stores/psql'
import { lockUsersForShare } from '@services/user-deletions/active-user-mutation-lock'

/**
 * Fences an export transition against user deletion and reports whether the owner is still active.
 * The users row is locked `FOR SHARE`, so deletion cannot commit between the active check and the
 * export transition it fences.
 */
export async function lockActiveDataRequestUser(
  query: TransactionQuery,
  userId: string,
): Promise<boolean> {
  return (await lockUsersForShare(query, [userId])).has(userId)
}
