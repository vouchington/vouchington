import type { TransactionQuery } from '@data-stores/psql'
import { recordPostPublicationChange } from '@services/post-publication'

export function recordPostClearancePublicationChange(
  query: TransactionQuery,
  postId: string,
  communityId?: string | null,
) {
  return recordPostPublicationChange(query, {
    scope: { type: 'post', postId },
    reason: 'post_clearance_changed',
    footprint: { priorCommunityId: communityId ?? undefined },
  })
}
