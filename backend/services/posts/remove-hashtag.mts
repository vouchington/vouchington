import assert from 'http-assert'
import { normalizeHashtag } from '@ts-shared/utils'
import type { PrivateUser } from '@services/users/types'
import { getUserActivePlan } from '@services/memberships'
import type { PostMutationAuthority } from '@services/entity-relations/post-access'
import { resolveHashtagMutation } from './hashtag-mutation-access.mts'
import { getRetainedPostCategories } from './hashtags.mts'
import { updatePost } from './update.mts'
import { HASHTAG_IN_POST_TEXT_MESSAGE, isHashtagInPostText } from './update/hashtag-intent.mts'

/**
 * Removes an explicit hashtag from a post the caller can edit, through the same post update that
 * adding one uses. A hashtag the post's title or text writes cannot be removed by a category edit,
 * so that is refused before any write rather than reported as removed. Removing a hashtag the post
 * does not carry changes nothing and reports `removed: false`.
 */
export async function removePostHashtag(
  currentUser: PrivateUser,
  postId: string,
  tag: string,
  authority: PostMutationAuthority,
): Promise<{ post_id: string; tag: string; removed: boolean }> {
  const { post, normalized, rootIds } = await resolveHashtagMutation(
    currentUser,
    postId,
    tag,
    authority,
  )
  assert(!isHashtagInPostText(post, normalized), 422, HASHTAG_IN_POST_TEXT_MESSAGE)
  const result = { post_id: post.id, tag: normalized.key }
  if (!(await hasExplicitHashtag(post.id, normalized.key))) return { ...result, removed: false }

  const membershipPlan = await getUserActivePlan(currentUser.id)
  await updatePost(currentUser, post, {}, membershipPlan, {
    change: { op: 'remove', hashtag: normalized },
    authority,
    rootIds,
  })
  if (await hasExplicitHashtag(post.id, normalized.key)) {
    throw new Error('Removed hashtag is still on the post')
  }
  return { ...result, removed: true }
}

async function hasExplicitHashtag(postId: string, key: string): Promise<boolean> {
  const categories = await getRetainedPostCategories(postId)
  return categories.some(
    category => category.type === 'hashtag' && normalizeHashtag(category.hashtag)?.key === key,
  )
}
