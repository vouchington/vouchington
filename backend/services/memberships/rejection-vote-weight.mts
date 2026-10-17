import { registerPostCommitAction, type QueryExecutor } from '@data-stores/psql'
import { enqueueRecalculateVoteWeightEvents } from '@queues/vote-aggregation/enqueues/vote-weight'

export function enqueueRejectedFamilyVoteWeightAfterCommit(
  query: QueryExecutor,
  target: { source_kind: string; user_id: string },
  evidenceId: string,
): void {
  if (target.source_kind !== 'family') return
  registerPostCommitAction(query, async () => {
    await enqueueRecalculateVoteWeightEvents([
      {
        userId: target.user_id,
        jobId: `voteWeight__${target.user_id}__evidenceRejected__${evidenceId}`,
      },
    ])
  })
}

export function validateMembershipEvidenceRejectionReason(reason: string): string {
  const rejectionReason = reason.trim()
  if (rejectionReason.length < 1 || rejectionReason.length > 1000)
    throw new RangeError('Rejection reason must be 1-1000 characters')
  return rejectionReason
}
