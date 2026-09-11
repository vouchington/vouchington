import { canViewPostsBatch } from '@services/posts'
import type { ReviewDisputeResponse } from '@services/review-disputes'
import type { PrivateUser } from '@services/users/types'

/** Removes authored post content the viewer cannot access while retaining the public dispute record. */
export async function filterReviewDisputePostContentForViewer(
  currentUser: PrivateUser,
  disputes: ReviewDisputeResponse[],
): Promise<ReviewDisputeResponse[]> {
  const disputesWithContent = disputes.filter(dispute => dispute.post_content !== null)
  if (disputesWithContent.length === 0) return disputes

  const visibility = await canViewPostsBatch(
    currentUser,
    disputesWithContent.map(dispute => ({ id: dispute.post_id })),
  )
  return disputes.map(dispute =>
    dispute.post_content !== null && !visibility.get(dispute.post_id)
      ? { ...dispute, post_content: null }
      : dispute,
  )
}
