import assert from 'http-assert'
import { getCommunityMember } from '@services/communities/members/get'
import { invalidate } from '@services/entity-cache/invalidate'
import type { PrivateUser } from '@services/users/types'
import { assertNotSuspended } from '@services/users/suspension-guard'
import { getPostByAnyCached } from './get-cached.mts'
import { getRouteAccessPost } from './route-access.mts'
import { currentUserCanLockPost } from './authorization.mts'
import { canViewPost } from './check-privacy-access.mts'
import { lockPost, unlockPost } from './lock.mts'

/** Shared REST/MCP lock authorization, mutation, and cache publication. */
export async function setPostLock(currentUser: PrivateUser, idOrSlug: string, locked: boolean) {
  assertNotSuspended(currentUser)
  const post = await getPostByAnyCached(idOrSlug)
  assert(post && !post.deleted_at, 404, 'Post not found')
  const privacyPost = await getRouteAccessPost(post)
  assert(privacyPost, 404, 'Post not found')
  assert(await canViewPost(currentUser, privacyPost), 404, 'Post not found')
  const communityMemberRole = post.community_id
    ? ((await getCommunityMember(post.community_id, currentUser.id))?.role ?? null)
    : null
  assert(currentUserCanLockPost(currentUser, post, { communityMemberRole }), 403, 'Forbidden')
  if (locked) await lockPost(post.id, currentUser.id)
  else await unlockPost(post.id, currentUser.id)
  await invalidate.posts(post.id)
}
