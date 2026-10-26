import type { TransactionQuery } from '@data-stores/psql'
import { retainPostPublicationImpactKeys } from './capture-keys.mts'
import { preparePostPublicationIdentityBridges } from './prepare-identity-bridges.mts'
import type { PostPublicationDirtyWork } from './types.mts'
import { recordPostPublicationChange } from './capture.mts'
import { recordPostPublicationChanges } from './capture-posts.mts'

/** Prepare the full author/post ownership set before either dirty scope is written. */
export async function prepareAuthorDeletionPublicationIdentityBridges(
  query: TransactionQuery,
  userId: string,
  postIds: string[],
) {
  await preparePostPublicationIdentityBridges(query, [
    {
      scope: { type: 'author', authorUserId: userId },
      reason: 'author_deleted',
      impactedPostIds: postIds,
    },
    ...postIds.map(postId => ({
      scope: { type: 'post' as const, postId },
      reason: 'author_deleted' as const,
    })),
  ])
}

export async function retainAuthorDeletionPublicationImpacts(
  query: TransactionQuery,
  authorWorkId: string,
  postIds: string[],
  postWork: PostPublicationDirtyWork[],
): Promise<PostPublicationDirtyWork[]> {
  await retainPostPublicationImpactKeys(query, authorWorkId, { postIds })
  return postWork
}

/** Records the same author and post publication footprints for one bounded deletion page. */
export async function recordAuthorDeletionWork(
  query: TransactionQuery,
  userId: string,
  priorUsername: string | null,
  postIds: string[],
): Promise<PostPublicationDirtyWork[]> {
  await prepareAuthorDeletionPublicationIdentityBridges(query, userId, postIds)
  const authorWork = await recordPostPublicationChange(query, {
    scope: { type: 'author', authorUserId: userId },
    reason: 'author_deleted',
    footprint: { priorAuthorUsername: priorUsername ?? undefined },
  })
  const postWork = await recordPostPublicationChanges(
    query,
    'author_deleted',
    postIds.map(postId => ({ postId })),
  )
  return retainAuthorDeletionPublicationImpacts(query, authorWork.id, postIds, postWork)
}
