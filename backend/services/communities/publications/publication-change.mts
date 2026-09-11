import type { TransactionQuery } from '@data-stores/psql'
import { recordPostPublicationChange } from '@services/post-publication'

export function recordCommunityPublicationChange(
  query: TransactionQuery,
  communityId: string,
  postId: string,
) {
  return recordPostPublicationChange(query, {
    scope: { type: 'post', postId },
    reason: 'community_publication_changed',
    impactedCommunityIds: [communityId],
    footprint: { priorCommunityId: communityId },
  })
}
