import type {
  ModerationAppealAction,
  ModerationAppealStatus,
} from '@ts-shared/utils/moderation-catalogs'

export interface ModerationAppeal {
  id: string
  case_id: string
  appellant_id: string
  user_warning_id: string | null
  community_ban_id: string | null
  post_id: string | null
  user_suspension_id: string | null
  community_id: string | null
  post_removal_kind: 'platform' | 'community' | null
  appeal_reason: string
  status: ModerationAppealStatus
  recommended_action: ModerationAppealAction | null
  ai_public_response: string | null
  ai_internal_response: string | null
  model: string | null
  ai_drafted_at: Date | null
  public_response: string | null
  internal_notes: string | null
  drafted_at: Date | null
  edited_at: Date | null
  edited_by_id: string | null
  approved_at: Date | null
  approved_by_id: string | null
  sent_at: Date | null
  resolved_at: Date | null
  resolved_by_id: string | null
  resolution_action: ModerationAppealAction | null
  latest_lifecycle_change_id: string | null
  created_at: Date
  updated_at: Date
  /** Derived field: true when the appeal has been pending longer than APPEAL_SLA_HOURS */
  is_overdue?: boolean
}
