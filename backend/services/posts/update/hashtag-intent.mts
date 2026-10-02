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
import { getPostHashtagKeys, getRetainedPostCategories } from '../hashtags.mts'
import createHttpError from 'http-errors'

/**
 * Adds or removes one explicit hashtag, merged into the post's retained categories under the
 * publication lock so a concurrent edit cannot drop the other categories.
 */
export type PostHashtagIntent = {
  change: { op: 'add' | 'remove'; hashtag: NormalizedHashtag }
  authority: PostMutationAuthority
  rootIds: ReadonlyMap<string, string>
}

export const HASHTAG_IN_POST_TEXT_MESSAGE =
  'The hashtag is written in the post title or text; edit the text to remove it'

export async function lockPostUpdatePublicationScopes(
  query: TransactionQuery,
  postId: string,
  intent?: PostHashtagIntent,
): Promise<void> {
  if (intent) {
    await lockPostPublicationPostScopes(query, [postId, ...intent.rootIds.values()])
  } else {
    await lockPostPublication(query, postId)
  }
}

export async function prepareLockedHashtagIntentChanges(
  creator: PrivateUser,
  post: Post,
  changes: UpdatePostChanges,
  intent: PostHashtagIntent,
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
  return getHashtagIntentChanges(post, intent.change, changes, options)
}

export async function getHashtagIntentChanges(
  post: Post,
  change: PostHashtagIntent['change'],
  changes: UpdatePostChanges,
  options: QueryOptions,
): Promise<UpdatePostChanges> {
  if (change.op === 'remove' && isHashtagInPostText(post, change.hashtag)) {
    // The post keeps a hashtag its text still writes, so dropping the explicit one removes nothing.
    throw createHttpError(422, HASHTAG_IN_POST_TEXT_MESSAGE)
  }
  const retained = await getRetainedPostCategories(post.id, options)
  const keys = new Set<string>()
  const categories = retained.filter(category => {
    if (category.type === 'topic') return true
    const normalized = normalizeHashtag(category.hashtag)
    if (!normalized) return false
    if (change.op === 'remove' && normalized.key === change.hashtag.key) return false
    if (keys.has(normalized.key)) return false
    keys.add(normalized.key)
    return true
  })
  if (change.op === 'add' && !keys.has(change.hashtag.key)) {
    categories.push({ type: 'hashtag', hashtag: change.hashtag.authored })
  }
  return { ...changes, categories }
}

/** Whether the post's title or text writes the hashtag, which no category edit can remove. */
export function isHashtagInPostText(post: Post, hashtag: NormalizedHashtag): boolean {
  return getPostHashtagKeys({ title: post.title, markdown: post.markdown }).includes(hashtag.key)
}
