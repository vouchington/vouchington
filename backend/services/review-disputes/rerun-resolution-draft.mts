import { recordStaffOperation } from '@services/moderator-actions/operation'
import { write } from '@data-stores/psql'
import assert from 'http-assert'
import { getReviewDisputeByIdFromPrimary } from './get.mts'
import { admitReviewDisputeResolutionRun } from './resolution-runs.mts'

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
    async () => {
      // Commit the run before enqueueing so the worker always finds it. A repeated request while
      // a run is active reads that run and enqueues it again under the same deterministic job id,
      // which is a no-op unless the first enqueue was lost.
      const { runId } = await admitReviewDisputeResolutionRun(disputeId, write)
      await enqueueDisputeResolutionQueued(disputeId, runId, staffUserId)
      return runId
    },
  )
}
