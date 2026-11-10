import type { TransactionQuery } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { PrivateUser } from '@services/users/types'
import createHttpError from 'http-errors'
import { getCommunityWithViewer } from '@services/communities/load-with-viewer'
import { getPostByAny } from '../get.mts'
import { assertDelegatedCommunityPostAllowed, loadWritablePost } from '../authorization.mts'
import type { CreatePostInput, Post } from '../types.mts'

/** Read parent/root authorization without locking the thread or community read context. */
export async function prepareDelegatedCreateScope(
  query: TransactionQuery,
  creator: PrivateUser,
  input: CreatePostInput,
  postType: string,
): Promise<Post | undefined> {
  const options = { query }
  const knownParent = input.parent_post_id
    ? await getPostByAny(input.parent_post_id, options)
    : undefined
  if (input.community_id && knownParent?.community_id)
    throw createHttpError(422, 'Only global posts can be discussed in a community')
  if (input.community_id) {
    await assertLoadedCommunityAllowsPost(input.community_id, creator.id, postType, options)
  }
  if (!input.parent_post_id) return undefined
  const { post: parent } = await loadWritablePost(
    creator,
    input.parent_post_id,
    'reply',
    options,
    knownParent ?? undefined,
  )
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
