import assert from 'http-assert'
import { getModerationAppealByIdFromPrimary } from './get.mts'

export async function rerunModerationAppealResolutionDraft(
  staffUserId: string,
  appealId: string,
): Promise<void> {
  const appeal = await getModerationAppealByIdFromPrimary(appealId)
  assert(appeal, 404, 'Appeal not found')
  assert(
    appeal.status === 'pending' && appeal.approved_at === null && appeal.sent_at === null,
    422,
    'Only unapproved, unsent pending appeals can rerun resolution drafts',
  )

  const { enqueueAppealResolutionAndWait } =
    await import('@queues/ai-agents/enqueues/appeal-resolution')
  await enqueueAppealResolutionAndWait(appealId, staffUserId)
}
