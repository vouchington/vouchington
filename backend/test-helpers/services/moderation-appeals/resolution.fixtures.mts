import { approveModerationAppeal } from '../../../services/moderation-appeals/approve-appeal.mts'
import { sendApprovedModerationAppealResolution } from '../../../services/moderation-appeals/send-appeal-resolution.mts'
import { updateModerationAppealDraft } from '../../../services/moderation-appeals/update-appeal-draft.mts'

export async function deliverModerationAppealForTest(
  staffUserId: string,
  appealId: string,
): Promise<void> {
  await draftAndApproveModerationAppealForTest(staffUserId, appealId)
  await sendApprovedModerationAppealResolution(staffUserId, appealId)
}

async function draftAndApproveModerationAppealForTest(
  staffUserId: string,
  appealId: string,
): Promise<void> {
  await updateModerationAppealDraft(staffUserId, appealId, {
    publicResponse: 'Human-approved appeal response.',
  })
  await approveModerationAppeal(staffUserId, appealId)
}
