import type {
  ModerationReportEntityType,
  ModerationReportReason,
} from '@ts-shared/utils/moderation-reports'
import type { CommunityBanEvasionContext } from '@/types/api-responses'

export type ReportReason = ModerationReportReason
export type ReportableEntityType = ModerationReportEntityType
export type ModerationReportStatus = 'pending' | 'reviewed' | 'actioned' | 'dismissed'
export type ModerationReportTargetContent = {
  kind: 'post' | 'comment'
  text: string
  declared_language: string | null
  lingua_rs_detected_language: string | null
}

interface ModerationReportListItem {
  id: string
  case_id: string
  created_at: string
  reviewed_at: string | null
  entity_type: ReportableEntityType
  entity_id: string
  target_label: string | null
  target_content: ModerationReportTargetContent | null
  target_path: string | null
  target_available: boolean | null
  reason: ReportReason
  status: ModerationReportStatus
  report_count: number
}

export interface MemberModerationReport extends ModerationReportListItem {
  post_moderation_context: unknown | null
}

export interface StaffModerationReport extends ModerationReportListItem {
  admin_action_path: string | null
  target_user_id: string | null
  target_is_restricted: boolean
  reporter_user_id: string
  reporter_username: string | null
  note: string | null
  resolved_by_id: string | null
  is_system_generated: boolean
  community_ban_evasion?: CommunityBanEvasionContext | null
  judgement: {
    recommended_action: 'no_action' | 'warn' | 'remove' | 'escalate'
    public_response: string
    internal_response: string
    is_stale: boolean
    judged_report_count: number | null
    current_report_count: number
  } | null
  post_moderation_context: unknown | null
}

export interface ModerationReportsPageInfo {
  page_info: {
    has_next_page: boolean
    has_previous_page: boolean
    start_cursor: string | null
    end_cursor: string | null
  }
}

export interface MemberFlatModerationReportsResponse extends ModerationReportsPageInfo {
  results: MemberModerationReport[]
}

export interface StaffFlatModerationReportsResponse extends ModerationReportsPageInfo {
  results: StaffModerationReport[]
}

export interface ModerationReportClusterIndicators {
  content_hash_duplicate: boolean
  embeddings_similarity: boolean
  velocity_spike: boolean
}

export interface StaffModerationReportCluster {
  id: string
  entity_type: ReportableEntityType
  entity_id: string
  report_count: number
  reporter_count: number
  reason_breakdown: Array<{ reason: ReportReason; count: number }>
  first_reported_at: string
  last_reported_at: string
  target_label: string | null
  target_content: ModerationReportTargetContent | null
  target_path: string | null
  admin_action_path: string | null
  target_user_id: string | null
  target_available: boolean | null
  target_is_restricted: boolean
  indicators: ModerationReportClusterIndicators
  reports: StaffModerationReport[]
}

export interface StaffModerationReportDuplicateCluster {
  id: string
  signal: 'content_hash_duplicate' | 'embeddings_similarity'
  post_count: number
  report_count: number
  reason_breakdown: Array<{ reason: ReportReason; count: number }>
  first_reported_at: string
  last_reported_at: string
  clusters: StaffModerationReportCluster[]
}

export interface StaffClusteredModerationReportsResponse extends ModerationReportsPageInfo {
  cluster_mode: 'entity'
  results: StaffModerationReportCluster[]
  duplicate_clusters: StaffModerationReportDuplicateCluster[]
}

export interface ModerationReportResolutionResponse {
  report: {
    id: string
    case_id: string
    created_at: string
    reviewed_at: string
    reporter_user_id: string
    entity_type: ReportableEntityType
    entity_id: string
    reason: ReportReason
    note: string | null
    status: 'reviewed' | 'dismissed'
    resolved_by_id: string
  }
}

export interface RerunReportJudgementResponse {
  queued: boolean
  rerun_by_id: string
}
