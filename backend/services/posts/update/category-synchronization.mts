import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import type { PrivateUser } from '@services/users/types'
import { assertCommunityPostTopicsNotMuted } from '@services/communities/publications/muted-topics'
import type { Post, UpdatePostChanges } from '../types.mts'
import { syncPostExplicitTopicCategoriesInTransaction } from '../explicit-topic-categories.mts'
import { syncPostHashtagCategoriesInTransaction } from '../hashtags.mts'
import { castPostCategoryVotesInTransaction } from '../hashtag-votes.mts'

type SynchronizePostCategoriesOptions = {
  changes: UpdatePostChanges
  creator: PrivateUser
  post: Post
  queryOptions: QueryOptions
  syncHashtagCategories: boolean
}

export async function castSynchronizedPostCategoryVotes({
  changes,
  creator,
  ownerId,
  post,
  query,
  syncHashtagCategories,
}: {
  changes: UpdatePostChanges
  creator: PrivateUser
  ownerId: string | null
  post: Post
  query: TransactionQuery
  syncHashtagCategories: boolean
}): Promise<void> {
  if (!syncHashtagCategories && changes.structured_data === undefined) return
  await castPostCategoryVotesInTransaction(query, creator, post.id, ownerId)
}

export async function synchronizePostCategoriesInTransaction({
  changes,
  creator,
  post,
  queryOptions,
  syncHashtagCategories,
}: SynchronizePostCategoriesOptions): Promise<void> {
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
}
