import { recordStaffOperation } from '@services/moderator-actions/operation'
import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { getModerationAppealByIdFromPrimary } from './get.mts'

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

  const { enqueueAppealResolutionQueued } =
    await import('@queues/ai-agents/enqueues/appeal-resolution')
  return recordStaffOperation(
    staffUserId,
    { actionType: 'appeal_resolution_draft_rerun', moderationAppealId: appealId },
    async () => {
      await using query = await beginTransaction()
      const { rows } = await query<{ ai_draft_request_token: string }>(sql`
        /* rerunModerationAppealResolutionDraft:reserve */
        UPDATE moderation_appeals
        SET ai_draft_request_token = uuidv7()
        WHERE id = ${appealId}
          AND approved_at IS NULL
          AND sent_at IS NULL
          AND resolved_at IS NULL
        RETURNING ai_draft_request_token
      `)
      assert(rows[0], 422, 'Appeal is no longer eligible for an AI rerun')
      const runId = await enqueueAppealResolutionQueued(
        appealId,
        rows[0].ai_draft_request_token,
        staffUserId,
      )
      await query.commit()
      return runId
    },
  )
}
