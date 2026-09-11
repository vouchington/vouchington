import type { QueryOptions } from '@data-stores/psql/types'
import type { PrivateUser } from '@services/users/types'
import { assertCommunityPostTopicsNotMuted } from '@services/communities/publications/muted-topics'
import type { Post, UpdatePostChanges } from '../types.mts'
import { syncPostExplicitTopicCategoriesInTransaction } from '../explicit-topic-categories.mts'
import { syncPostHashtagCategoriesInTransaction } from '../hashtags.mts'
import {
  persistPostCategoryFinalization,
  type PostCategoryFinalization,
} from '../post-category-finalizations.mts'

type SynchronizePostCategoriesOptions = {
  changes: UpdatePostChanges
  creator: PrivateUser
  post: Post
  queryOptions: QueryOptions
  syncHashtagCategories: boolean
}

export async function synchronizePostCategoriesInTransaction({
  changes,
  creator,
  post,
  queryOptions,
  syncHashtagCategories,
}: SynchronizePostCategoriesOptions): Promise<PostCategoryFinalization | undefined> {
  if (syncHashtagCategories) {
    await syncPostHashtagCategoriesInTransaction(
      creator,
      post.id,
      {
        ...changes,
        title: changes.title ?? post.title,
        markdown: changes.markdown ?? post.markdown,
      },
      queryOptions,
    )
    await syncPostExplicitTopicCategoriesInTransaction(post.id, changes.categories, queryOptions)
    if (post.community_id && post.post_type !== 'comment') {
      await assertCommunityPostTopicsNotMuted(
        post.id,
        post.community_id,
        queryOptions,
        'unfinalized',
      )
    }
  }
  if (syncHashtagCategories || changes.structured_data !== undefined) {
    return persistPostCategoryFinalization(
      post.id,
      creator.id,
      post.created_by_id ?? creator.id,
      'update',
      queryOptions,
    )
  }
  return undefined
}
