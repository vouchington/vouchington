import type { PrivateUser } from '@services/users/types'
import { recordTerritorialCopyrightDecision } from './territorial-decision.mts'

export type UkCopyrightReview = {
  id: string
  reviewed_at: Date
  automation_disclosure: 'human'
}

/** The UK decision is the staff review of the notice. */
export async function recordUkCopyrightReview(
  actor: PrivateUser,
  noticeId: string,
  rationale: string,
): Promise<UkCopyrightReview> {
  const decision = await recordTerritorialCopyrightDecision(actor, 'uk', noticeId, rationale)
  return {
    id: decision.id,
    reviewed_at: decision.decided_at,
    automation_disclosure: decision.automation_disclosure,
  }
}
