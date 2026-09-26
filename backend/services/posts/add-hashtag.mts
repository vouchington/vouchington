import assert from 'http-assert'
import { normalizeHashtag } from '@ts-shared/utils'
import { assertNotSuspended, entityRelationViewerFor } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import { getUserActivePlan } from '@services/memberships'
import { getTopicAliasIdByKey } from '@services/topics/get-topic-aliases'
import {
  assertPostMutationAccess,
  type PostMutationAuthority,
} from '@services/entity-relations/post-access'
import { BLOCKED_POST_TYPES, canViewPost } from './check-privacy-access.mts'
import { currentUserCanUpdatePost } from './authorization.mts'
import { getPostByAny } from './get.mts'
import { updatePost } from './update.mts'
import { assertPostUpdatePreflight } from './update/validation.mts'

export async function addPostHashtag(
  currentUser: PrivateUser,
  postId: string,
  tag: string,
  authority: PostMutationAuthority,
): Promise<{ post_id: string; tag: string; topic_alias_id: string }> {
  assertNotSuspended(currentUser)
  const post = await getPostByAny(postId, { readOnly: false })
  assert(post && !post.deleted_at && !BLOCKED_POST_TYPES.has(post.post_type), 404, 'Post not found')
  const root = post.root_id ? await getPostByAny(post.root_id, { readOnly: false }) : post
  assert(root && !BLOCKED_POST_TYPES.has(root.post_type), 404, 'Post not found')
  assert(await canViewPost(currentUser, post, { readOnly: false }), 404, 'Post not found')
  assert(currentUserCanUpdatePost(currentUser, post), 403, 'Forbidden')

  const normalized = normalizeHashtag(tag)
  assert(normalized, 422, 'Invalid hashtag')
  assertPostUpdatePreflight(currentUser, post, {}, true)
  const viewer = entityRelationViewerFor(currentUser)
  const postIds = { subjectIds: [post.id], objectIds: [] }
  const rootIds = await assertPostMutationAccess(viewer, authority, postIds)
  const membershipPlan = await getUserActivePlan(currentUser.id)
  await updatePost(currentUser, post, {}, membershipPlan, {
    additiveHashtag: normalized,
    authority,
    rootIds,
  })

  const aliasId = await getTopicAliasIdByKey(normalized.key)
  if (!aliasId) throw new Error('Committed hashtag alias is missing from the primary')
  return { post_id: post.id, tag: normalized.key, topic_alias_id: aliasId }
}
