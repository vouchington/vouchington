import { recordStaffOperation } from '@services/moderator-actions/operation'
import assert from 'http-assert'
import { getReviewDisputeByIdFromPrimary } from './get.mts'

export async function rerunReviewDisputeResolutionDraft(
  staffUserId: string,
  disputeId: string,
): Promise<string> {
  const dispute = await getReviewDisputeByIdFromPrimary(disputeId)
  assert(dispute, 404, 'Appeal not found')
  assert(
    dispute.status === 'pending' && dispute.approved_at === null && dispute.sent_at === null,
    422,
    'Only unapproved, unsent pending disputes can rerun resolution drafts',
  )

  const { enqueueDisputeResolutionQueued } =
    await import('@queues/ai-agents/enqueues/dispute-resolution')
  return recordStaffOperation(
    staffUserId,
    { actionType: 'dispute_resolution_draft_rerun', reviewDisputeId: disputeId },
    () => enqueueDisputeResolutionQueued(disputeId, staffUserId),
  )
}
