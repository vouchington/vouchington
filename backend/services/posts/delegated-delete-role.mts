import { getCommunityMember } from '@services/communities/members/get'
import type { CommunityMemberRole } from '@services/communities/types'
import type { PrivateUser } from '@services/users/types'
import type { QueryOptions } from '@data-stores/psql'
import type { Post } from './types.mts'

/** Reuse the role locked by delegated delete's transaction recheck when it is available. */
export async function getDelegatedDeleteCommunityMemberRole(
  user: PrivateUser,
  post: Post,
  operation: 'edit' | 'delete' | 'reply',
  knownRole: CommunityMemberRole | null | undefined,
  options: QueryOptions,
): Promise<CommunityMemberRole | null> {
  if (operation !== 'delete' || !post.community_id || post.post_type !== 'comment') return null
  if (knownRole !== undefined) return knownRole
  return (await getCommunityMember(post.community_id, user.id, options))?.role ?? null
}
