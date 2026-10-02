import type { ModerationAppealResponse } from './types.mts'
import type { ModerationTrainingEvidence } from '@services/moderation-training'
import {
  DISMISS_DELIVERED_APPEAL_RESOLUTION,
  finalizeDeliveredModerationAppeal,
} from './resolve-shared.mts'

export async function dismissModerationAppeal(
  staffUserId: string,
  appealId: string,
  trainingEvidence: ModerationTrainingEvidence,
): Promise<ModerationAppealResponse> {
  return finalizeDeliveredModerationAppeal(
    staffUserId,
    appealId,
    DISMISS_DELIVERED_APPEAL_RESOLUTION,
    trainingEvidence,
  )
}
