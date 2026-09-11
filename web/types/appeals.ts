import type {
  ModerationAppealAction,
  ModerationAppealStatus,
} from '@ts-shared/utils/moderation-catalogs'

export type { ModerationAppealAction, ModerationAppealStatus }

export type ModerationAppealViewerRole = 'administrator' | 'moderator' | 'member'

export interface ModerationActorSummary {
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
  | { type: 'suspension'; id: string; reason: string | null; created_at: string }
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

export interface ModerationAppeal {
  id: string
  user_warning_id: string | null
  community_ban_id: string | null
  post_id: string | null
  user_suspension_id: string | null
  community_id: string | null
  post_removal_kind: 'platform' | 'community' | null
  status: ModerationAppealStatus
  recommended_action: ModerationAppealAction | null
  ai_drafted_at: string | null
  public_response: string | null
  drafted_at: string | null
  edited_at: string | null
  approved_at: string | null
  sent_at: string | null
  resolved_at: string | null
  resolution_action: ModerationAppealAction | null
  is_overdue?: boolean
  created_at: string
  updated_at: string
  target_context: ModerationAppealTargetContext | null
  // Staff-only fields (omitted in redacted tier)
  appellant_id?: string
  appeal_reason?: string
  ai_public_response?: string | null
  ai_internal_response?: string | null
  model?: string | null
  internal_notes?: string | null
  edited_by_id?: string | null
  approved_by_id?: string | null
  resolved_by_id?: string | null
  latest_lifecycle_change_id?: string | null
  staff_context?: {
    appellant: ModerationActorSummary
    original_decision: {
      internal_reason: string | null
      actor: ModerationActorSummary | null
    }
  }
}

export function canResolveModerationAppealAction(
  appeal: ModerationAppeal,
  action: ModerationAppealAction,
  viewerRole: ModerationAppealViewerRole,
): boolean {
  if (!appeal.sent_at) return false
  if (viewerRole !== 'administrator' && viewerRole !== 'moderator') return false
  if (action === 'accept' && appeal.user_suspension_id) return viewerRole === 'administrator'
  return true
}
