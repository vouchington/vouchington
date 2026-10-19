import type { QueryOptions } from '@data-stores/psql/types'
import { getRequestCurrentUser } from '@modules/utils/request-context'
import { getPrivateUserByAny } from './get.mts'
import type { PrivateUser } from './types.mts'

/**
 * The acting user this request already loaded.
 * A transaction query is a later statement and always reads, so a lock holder sees the prior commit.
 * Outside a request the caller gets the same primary read it uses today.
 */
export async function loadRequestPrivateUser(
  userId: string,
  options?: QueryOptions,
): Promise<PrivateUser | null> {
  if (!options?.query) {
    const stored = getRequestCurrentUser<PrivateUser>()
    if (stored?.id === userId) return stored
  }
  return getPrivateUserByAny(userId, options)
}
