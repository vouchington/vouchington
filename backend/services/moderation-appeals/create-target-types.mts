import type { ModerationAppeal } from './config.mts'

export type AppealTargetContext = {
  communityId: string | null
  userWarningId: string | null
  communityBanId: string | null
  postId: string | null
  userSuspensionId: string | null
  postRemovalKind: 'platform' | 'community' | null
  caseId: string
  originalDecisionReason: string | null
  originalDecisionActorId: string | null
  originalDecisionAt: Date
  /** Defined when the target already has a duplicate pending appeal. */
  duplicate?: ModerationAppeal
}
