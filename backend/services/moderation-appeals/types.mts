import type { ModerationAppeal } from './config.mts'

export type ModerationActorSummary = {
  id: string
  username: string | null
  verified_display_name: string | null
  profile_image_id: string | null
}

export type ModerationAppealTargetContext =
  | {
      type: 'warning'
      id: string
      public_message: string | null
      created_at: string
      community: { id: string; name: string } | null
    }
  | {
      type: 'community_ban'
      id: string
      reason: string | null
      expires_at: string | null
      created_at: string
      community: { id: string; name: string }
    }
  | {
      type: 'suspension'
      id: string
      reason: string | null
      created_at: string
    }
  | {
      type: 'post_removal'
      id: string
      kind: 'platform' | 'community'
      title: string
      declared_language: string | null
      lingua_rs_detected_language: string | null
      decided_at: string | null
      public_reason: string | null
      community: { id: string; name: string } | null
    }

export type ModerationAppealResponse = ModerationAppeal & {
  target_context?: ModerationAppealTargetContext | null
  staff_context?: {
    appellant: ModerationActorSummary
    original_decision: {
      internal_reason: string | null
      actor: ModerationActorSummary | null
    }
  }
}
