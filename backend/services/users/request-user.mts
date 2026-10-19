import type { QueryOptions } from '@data-stores/psql/types'
import { getRequestCurrentUser } from '@modules/utils/request-context'
import { getPrivateUserByAny } from './get.mts'
import type { PrivateUser } from './types.mts'

/**
 * The acting user this request already loaded.
 * A primary read or a transaction query is a later statement and always reads, so a deletion
 * or a lock holder is visible. Outside a request the caller gets the same primary read it uses today.
 */
export async function loadRequestPrivateUser(
  userId: string,
  options?: QueryOptions,
): Promise<PrivateUser | null> {
  if (!options?.query && options?.readOnly !== false) {
    const stored = getRequestCurrentUser<PrivateUser>()
    if (stored?.id === userId) return stored
  }
  return getPrivateUserByAny(userId, options)
}
