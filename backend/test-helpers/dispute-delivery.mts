import { approveReviewDispute } from '../services/review-disputes/approve-dispute.mts'
import { sendApprovedReviewDisputeResolution } from '../services/review-disputes/send-dispute-resolution.mts'
import { updateReviewDisputeDraft } from '../services/review-disputes/update-dispute-draft.mts'

/** Exercise the same draft, approval and delivery workflow as staff before resolving. */
export async function deliverReviewDisputeForTest(
  actorId: string,
  disputeId: string,
): Promise<void> {
  await updateReviewDisputeDraft(actorId, disputeId, {
    publicResponse: 'Human-approved dispute response.',
  })
  await approveReviewDispute(actorId, disputeId)
  await sendApprovedReviewDisputeResolution(actorId, disputeId)
}
