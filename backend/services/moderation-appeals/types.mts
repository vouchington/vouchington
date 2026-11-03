import type { ModerationAppeal } from './config.mts'

/** Staff-only projection of the typed original-decision facts on moderation_appeals. */
export type OriginalModerationDecision = {
  internal_reason: string | null
  actor: ModerationActorSummary | null
}

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
    original_decision: OriginalModerationDecision
  }
}

/**
 * One row of the appeal list. Staff and members both get summaries; the detail read carries the
 * appeal reason, drafts, notes and the original decision. `public_response` is set only once it
 * was sent.
 */
export type ModerationAppealSummary = Pick<
  ModerationAppeal,
  | 'id'
  | 'user_warning_id'
  | 'community_ban_id'
  | 'post_id'
  | 'user_suspension_id'
  | 'community_id'
  | 'post_removal_kind'
  | 'status'
  | 'recommended_action'
  | 'is_overdue'
  | 'public_response'
  | 'approved_at'
  | 'sent_at'
  | 'resolved_at'
  | 'resolution_action'
  | 'created_at'
  | 'updated_at'
> & {
  target_context: ModerationAppealTargetContext | null
  appellant: ModerationActorSummary
  has_ai_draft: boolean
  has_draft: boolean
}
