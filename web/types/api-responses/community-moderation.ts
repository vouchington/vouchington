import type * as Api from './shared'
import type { ReportReason } from '@/lib/api/client/reports'
import type { ModerationReportTargetContent } from '@/lib/api/client/reports-contracts'
import type {
  ModerationReportStatus,
  ModeratorActionType,
} from '@ts-shared/utils/moderation-catalogs'
import type { ModerationJudgementAction } from '@ts-shared/utils/moderation-policy'

type PublicUser = Api.PublicUser

export type { ModeratorActionType }

export interface CommunityModeratorStatEntry {
  actor_id: string
  total: number
  counts: Partial<Record<ModeratorActionType, number>>
}

export interface CommunityModeratorStatsResponseBody {
  window: 30 | 90
  stats: CommunityModeratorStatEntry[]
  users: Record<string, PublicUser>
}

export interface CommunityBanEvasionContext {
  community_id: string
  community_slug: string
  source_user_id?: string
  source_username?: string | null
  score?: number
  flagged_at?: string
}

export interface ModerationQueueClaim {
  id: string
  community_id: string
  report_id: string | null
  post_id: string | null
  claimed_by_id: string
  claimed_at: string
  released_at: string | null
}

export interface CommunityModerationReport {
  id: string
  created_at: string
  reviewed_at: string | null
  entity_type: 'post' | 'comment' | 'user'
  entity_id: string
  admin_action_path: string | null
  target_label: string | null
  target_content: ModerationReportTargetContent | null
  target_path: string | null
  target_pending_community_review?: boolean
  target_user_id?: string | null
  reason: ReportReason
  /** Present only for site-staff community report viewers; omitted in redacted responses. */
  note?: string | null
  status: ModerationReportStatus
  report_count: number
  resolved_by_id: string | null
  judgement?: {
    recommended_action: ModerationJudgementAction
    public_response: string
    internal_response: string
    is_stale: boolean
    judged_report_count: number | null
    current_report_count: number
  } | null
  reporter_user_id?: string | null
  /** Ban-evasion context for user-entity system reports. */
  community_ban_evasion?: CommunityBanEvasionContext | null
  claim?: ModerationQueueClaim | null
  escalated_at?: string | null
}

export interface CommunityModerationReportsResponseBody {
  reports: CommunityModerationReport[]
  page_info?: Api.PageInfo
}

export interface CommunityMemberVacation {
  community_id: string
  user_id: string
  starts_at: string
  ends_at: string | null
  created_at: string
  updated_at: string
}

export interface ModeratorVacationResponseBody {
  vacation: CommunityMemberVacation | null
  suppress_community_digests_while_on_vacation: boolean
}

export interface ModeratorVacationDigestPreferenceResponseBody {
  suppress_community_digests_while_on_vacation: boolean
}
