import type { ModerationAppealResponse } from './types.mts'
import type { ModerationTrainingEvidence } from '@services/moderation-training'
import type { TransactionQuery } from '@data-stores/psql'
import {
  DISMISS_DELIVERED_APPEAL_RESOLUTION,
  finalizeDeliveredModerationAppeal,
} from './resolve-shared.mts'

export async function dismissModerationAppeal(
  staffUserId: string,
  appealId: string,
  trainingEvidence: ModerationTrainingEvidence,
  options: { query?: TransactionQuery } = {},
): Promise<ModerationAppealResponse> {
  return finalizeDeliveredModerationAppeal(
    staffUserId,
    appealId,
    DISMISS_DELIVERED_APPEAL_RESOLUTION,
    trainingEvidence,
    options,
  )
}
