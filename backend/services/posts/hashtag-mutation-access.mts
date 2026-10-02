import assert from 'http-assert'
import { normalizeHashtag } from '@ts-shared/utils'
import { assertNotSuspended, entityRelationViewerFor } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import {
  assertPostMutationAccess,
  type PostMutationAuthority,
} from '@services/entity-relations/post-access'
import { BLOCKED_POST_TYPES, canViewPost } from './check-privacy-access.mts'
import { currentUserCanUpdatePost } from './authorization.mts'
import { getPostByAny } from './get.mts'
import { assertPostUpdatePreflight } from './update/validation.mts'

/**
 * The checks every hashtag change on an existing post passes before it writes: suspension, the
 * post's visibility and editability, the hashtag's form, and private-post authority. The post and
 * its roots are read from the primary so the change is judged on committed state.
 */
export async function resolveHashtagMutation(
  currentUser: PrivateUser,
  postId: string,
  tag: string,
  authority: PostMutationAuthority,
) {
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
  return { post, normalized, rootIds }
}
