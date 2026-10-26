import type { TransactionQuery } from '@data-stores/psql'
import { recordPostPublicationChange } from './capture.mts'
import { recordPostPublicationChanges } from './capture-posts.mts'

/** Captures author and per-post old keys before one author-deletion mutation page. */
export async function recordAuthorDeletionWork(
  query: TransactionQuery,
  userId: string,
  priorUsername: string | null,
  postIds: string[],
  topicIdsByPost: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): Promise<void> {
  await recordPostPublicationChange(query, {
    scope: { type: 'author', authorUserId: userId },
    reason: 'author_deleted',
    impactedPostIds: postIds,
    footprint: { priorAuthorUsername: priorUsername ?? undefined },
  })
  await recordPostPublicationChanges(
    query,
    'author_deleted',
    postIds.map(postId => ({
      postId,
      impactedTopicIds: [...(topicIdsByPost.get(postId) ?? [])],
    })),
  )
}
