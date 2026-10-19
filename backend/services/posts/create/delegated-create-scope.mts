import type { QueryOptions } from '@data-stores/psql/types'
import type { PrivateUser } from '@services/users/types'
import createHttpError from 'http-errors'
import { getCommunityWithViewer } from '@services/communities/load-with-viewer'
import { getPostByAny } from '../get.mts'
import { assertDelegatedCommunityPostAllowed, loadWritablePost } from '../authorization.mts'
import { lockDelegatedPostCommunity, lockDelegatedPostThread } from '../delegated-write-locks.mts'
import type { CreatePostInput, Post } from '../types.mts'

/** One pre-lock parent row, then the post-lock read that sees the previous lock holder's commit. */
export async function prepareDelegatedCreateScope(
  query: NonNullable<QueryOptions['query']>,
  creator: PrivateUser,
  input: CreatePostInput,
  postType: string,
): Promise<Post | undefined> {
  const options = { query }
  const prelockedParent = input.parent_post_id
    ? await getPostByAny(input.parent_post_id, options)
    : undefined
  if (input.community_id && prelockedParent?.community_id)
    throw createHttpError(422, 'Only global posts can be discussed in a community')
  if (input.community_id) {
    await lockDelegatedPostCommunity(query, input.community_id, creator.id)
    await assertLoadedCommunityAllowsPost(input.community_id, creator.id, postType, options)
  }
  if (!input.parent_post_id) return undefined
  await lockDelegatedPostThread(query, input.parent_post_id, creator.id, prelockedParent)
  const parent = await loadWritablePost(creator, input.parent_post_id, false, options)
  if (parent.community_id && parent.community_id !== input.community_id)
    await assertLoadedCommunityAllowsPost(parent.community_id, creator.id, postType, options)
  return parent
}

async function assertLoadedCommunityAllowsPost(
  communityId: string,
  creatorId: string,
  postType: string,
  options: QueryOptions,
): Promise<void> {
  const loaded = await getCommunityWithViewer(communityId, creatorId, options)
  if (!loaded) throw createHttpError(404, 'Community not found')
  await assertDelegatedCommunityPostAllowed(communityId, postType, options, loaded.community)
}
