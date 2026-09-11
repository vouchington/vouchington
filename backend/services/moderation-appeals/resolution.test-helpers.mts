import { approveModerationAppeal } from './approve-appeal.mts'
import { sendApprovedModerationAppealResolution } from './send-appeal-resolution.mts'
import { updateModerationAppealDraft } from './update-appeal-draft.mts'

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
