import { recordStaffOperation } from '@services/moderator-actions/operation'
import { write } from '@data-stores/psql'
import assert from 'http-assert'
import { getModerationAppealByIdFromPrimary } from './get.mts'
import { claimAppealResolutionRun, createAppealResolutionRun } from './rerun-outcomes.mts'

export async function rerunModerationAppealResolutionDraft(
  staffUserId: string,
  appealId: string,
): Promise<string> {
  const appeal = await getModerationAppealByIdFromPrimary(appealId)
  assert(appeal, 404, 'Appeal not found')
  assert(
    appeal.status === 'pending' && appeal.approved_at === null && appeal.sent_at === null,
    422,
    'Only unapproved, unsent pending appeals can rerun resolution drafts',
  )

  return recordStaffOperation(
    staffUserId,
    { actionType: 'appeal_resolution_draft_rerun', moderationAppealId: appealId },
    async () => {
      const { requestToken, runId } = await enqueueAppealRerun(staffUserId, appealId)
      // The worker may start before this acknowledgement. Both paths use the same monotonic claim.
      await claimAppealResolutionRun(appealId, requestToken)
      return runId
    },
  )
}

async function enqueueAppealRerun(staffUserId: string, appealId: string) {
  // Commit the outcome before enqueue without invalidating the previous paid generation.
  const [requestToken, { enqueueAppealResolutionQueued }] = await Promise.all([
    createAppealResolutionRun(write, appealId),
    import('@queues/ai-agents/enqueues/appeal-resolution'),
  ])
  const runId = await enqueueAppealResolutionQueued(appealId, requestToken, staffUserId)
  return { requestToken, runId }
}
