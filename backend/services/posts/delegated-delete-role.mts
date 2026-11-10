import { getCommunityMember } from '@services/communities/members/get'
import type { CommunityMemberRole } from '@services/communities/types'
import type { PrivateUser } from '@services/users/types'
import type { QueryOptions } from '@data-stores/psql'
import type { Post } from './types.mts'

/** Read the current community role without locking membership read context. */
export async function getDelegatedDeleteCommunityMemberRole(
  user: PrivateUser,
  post: Post,
  operation: 'edit' | 'delete' | 'reply',
  options: QueryOptions,
): Promise<CommunityMemberRole | null> {
  if (operation !== 'delete' || !post.community_id || post.post_type !== 'comment') return null
  return (await getCommunityMember(post.community_id, user.id, options))?.role ?? null
}
