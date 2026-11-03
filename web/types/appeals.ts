import type {
  ModerationAppealAction,
  ModerationAppealStatus,
} from '@ts-shared/utils/moderation-catalogs'

export type { ModerationAppealAction }

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
  appellant_user_id?: string
  appeal_reason?: string
  ai_public_response?: string | null
  ai_internal_response?: string | null
  model?: string | null
  internal_notes?: string | null
  edited_by_id?: string | null
  approved_by_id?: string | null
  resolved_by_id?: string | null
  latest_lifecycle_change_id?: string | null
  ai_draft_requested_run_id?: string
  ai_draft_run_id?: string | null
  staff_context?: {
    appellant: ModerationActorSummary
    original_decision: {
      internal_reason: string | null
      actor: ModerationActorSummary | null
    }
  }
}

/**
 * One row of the appeal list. Staff rows add the appellant and draft flags; members get only the
 * public fields. The appeal reason, drafts, notes and original decision load from the detail read.
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
  | 'target_context'
> & {
  appellant?: ModerationActorSummary
  has_ai_draft?: boolean
  has_draft?: boolean
}

/** The list row a full detail read stands for, after a staff action changed it. */
export function toModerationAppealSummary(appeal: ModerationAppeal): ModerationAppealSummary {
  return {
    id: appeal.id,
    user_warning_id: appeal.user_warning_id,
    community_ban_id: appeal.community_ban_id,
    post_id: appeal.post_id,
    user_suspension_id: appeal.user_suspension_id,
    community_id: appeal.community_id,
    post_removal_kind: appeal.post_removal_kind,
    status: appeal.status,
    recommended_action: appeal.recommended_action,
    is_overdue: appeal.is_overdue,
    // A response is public only once it was sent; an unsent one is a draft.
    public_response: appeal.sent_at ? appeal.public_response : null,
    approved_at: appeal.approved_at,
    sent_at: appeal.sent_at,
    resolved_at: appeal.resolved_at,
    resolution_action: appeal.resolution_action,
    created_at: appeal.created_at,
    updated_at: appeal.updated_at,
    target_context: appeal.target_context,
    appellant: appeal.staff_context?.appellant,
    has_ai_draft: Boolean(appeal.ai_drafted_at),
    has_draft: Boolean(appeal.public_response),
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
