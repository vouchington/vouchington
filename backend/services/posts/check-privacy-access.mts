import type { PrivateUser } from '@services/users/types'
import { canViewPostsBatch, type PostAccessInput } from './check-privacy-access-batch.mts'
import type { QueryOptions } from '@data-stores/psql'

export { canViewPostsBatch, type PostAccessInput } from './check-privacy-access-batch.mts'
export { BLOCKED_POST_TYPES } from './blocked-post-types.mts'

/**
 * Checks whether the current user can view a post.
 */
export async function canViewPost(
  currentUser: PrivateUser | null,
  post: PostAccessInput,
  options: QueryOptions = {},
): Promise<boolean> {
  return (await canViewPostsBatch(currentUser, [post], options)).get(post.id) ?? false
}
