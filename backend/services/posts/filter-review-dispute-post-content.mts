import { canViewPostsBatch } from './check-privacy-access-batch.mts'
import type { ReviewDisputeResponse } from '@services/review-disputes'
import type { PrivateUser } from '@services/users/types'

/** Removes authored post content the viewer cannot access while retaining the public dispute record. */
export async function filterReviewDisputePostContentForViewer(
  currentUser: PrivateUser,
  disputes: ReviewDisputeResponse[],
): Promise<ReviewDisputeResponse[]> {
  if (disputes.length === 0) return disputes

  const visibility = await canViewPostsBatch(
    currentUser,
    disputes.map(dispute => ({ id: dispute.post_id })),
  )
  return disputes.map(dispute =>
    !visibility.get(dispute.post_id)
      ? { ...dispute, post_content: null, post_label: 'review' }
      : dispute,
  )
}
