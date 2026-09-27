import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import { normalizeHashtag, type NormalizedHashtag } from '@ts-shared/utils'
import {
  assertPostMutationAccess,
  type PostMutationAuthority,
} from '@services/entity-relations/post-access'
import { entityRelationViewerFor } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import { lockPostPublication, lockPostPublicationPostScopes } from '@services/post-publication'
import { canViewPost } from '../check-privacy-access.mts'
import { assertPostUpdatePreflight } from './validation.mts'
import type { Post, UpdatePostChanges } from '../types.mts'
import { getRetainedPostCategories } from '../hashtags.mts'
import createHttpError from 'http-errors'

export type AdditiveHashtagIntent = {
  additiveHashtag: NormalizedHashtag
  authority: PostMutationAuthority
  rootIds: ReadonlyMap<string, string>
}

export async function lockPostUpdatePublicationScopes(
  query: TransactionQuery,
  postId: string,
  intent?: AdditiveHashtagIntent,
): Promise<void> {
  if (intent) {
    await lockPostPublicationPostScopes(query, [postId, ...intent.rootIds.values()])
  } else {
    await lockPostPublication(query, postId)
  }
}

export async function prepareLockedAdditiveHashtagChanges(
  creator: PrivateUser,
  post: Post,
  changes: UpdatePostChanges,
  intent: AdditiveHashtagIntent,
  options: QueryOptions,
): Promise<UpdatePostChanges> {
  if (!(await canViewPost(creator, post, options))) throw createHttpError(404, 'Post not found')
  assertPostUpdatePreflight(creator, post, changes, true)
  await assertPostMutationAccess(
    entityRelationViewerFor(creator),
    intent.authority,
    { subjectIds: [post.id], objectIds: [] },
    options,
    intent.rootIds,
  )
  return getAdditiveHashtagChanges(post.id, intent.additiveHashtag, changes, options)
}

export async function getAdditiveHashtagChanges(
  postId: string,
  hashtag: NormalizedHashtag,
  changes: UpdatePostChanges,
  options: QueryOptions,
): Promise<UpdatePostChanges> {
  const retained = await getRetainedPostCategories(postId, options)
  const keys = new Set<string>()
  const categories = retained.filter(category => {
    if (category.type === 'topic') return true
    const normalized = normalizeHashtag(category.hashtag)
    if (!normalized || keys.has(normalized.key)) return false
    keys.add(normalized.key)
    return true
  })
  if (!keys.has(hashtag.key)) {
    categories.push({ type: 'hashtag', hashtag: hashtag.authored })
  }
  return { ...changes, categories }
}
