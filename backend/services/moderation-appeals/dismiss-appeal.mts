import type { ModerationTrainingEvidence } from '@services/moderation-training'
import type { ModerationAppeal } from './config.mts'
import {
  DISMISS_DELIVERED_APPEAL_RESOLUTION,
  finalizeDeliveredModerationAppeal,
} from './resolve-shared.mts'

export async function dismissModerationAppeal(
  staffUserId: string,
  appealId: string,
  trainingEvidence: ModerationTrainingEvidence,
): Promise<ModerationAppeal> {
  return finalizeDeliveredModerationAppeal(
    staffUserId,
    appealId,
    DISMISS_DELIVERED_APPEAL_RESOLUTION,
    trainingEvidence,
  )
}
