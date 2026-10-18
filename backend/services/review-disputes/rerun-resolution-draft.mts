import { recordStaffOperation } from '@services/moderator-actions/operation'
import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
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
    async () => {
      // Hold the dispute row until queue admission settles. If admission fails, disposal
      // rolls back the generation so an earlier automatic run remains eligible to save.
      await using query = await beginTransaction()
      const { rows } = await query<{ ai_draft_request_token: string }>(sql`
        /* rerunReviewDisputeResolutionDraft:reserve */
        UPDATE review_disputes
        SET ai_draft_request_token = uuidv7()
        WHERE id = ${disputeId}
          AND approved_at IS NULL
          AND sent_at IS NULL
          AND resolved_at IS NULL
        RETURNING ai_draft_request_token
      `)
      assert(rows[0], 422, 'Dispute is no longer eligible for an AI rerun')
      const runId = await enqueueDisputeResolutionQueued(
        disputeId,
        rows[0].ai_draft_request_token,
        staffUserId,
      )
      await query.commit()
      return runId
    },
  )
}
