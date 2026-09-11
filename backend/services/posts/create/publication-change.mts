import type { TransactionQuery } from '@data-stores/psql'
import { recordPostPublicationChange } from '@services/post-publication'

export function recordCreatedPostPublicationChange(
  query: TransactionQuery,
  postId: string,
  authorUserId: string,
  communityId: string | null,
  rootId: string | null,
) {
  return recordPostPublicationChange(query, {
    scope: { type: 'post', postId },
    reason: 'post_created',
    footprint: {
      priorAuthorUserId: authorUserId,
      priorCommunityId: communityId ?? undefined,
      priorRootId: rootId ?? undefined,
    },
  })
}
