import type { ModerationAppeal } from './config.mts'
import {
  DISMISS_DELIVERED_APPEAL_RESOLUTION,
  finalizeDeliveredModerationAppeal,
} from './resolve-shared.mts'

export async function dismissModerationAppeal(
  staffUserId: string,
  appealId: string,
): Promise<ModerationAppeal> {
  return finalizeDeliveredModerationAppeal(
    staffUserId,
    appealId,
    DISMISS_DELIVERED_APPEAL_RESOLUTION,
  )
}
