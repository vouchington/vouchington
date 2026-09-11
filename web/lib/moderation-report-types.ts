import type {
  MemberFlatModerationReportsResponse,
  ModerationReportClusterIndicators,
  StaffClusteredModerationReportsResponse,
  StaffFlatModerationReportsResponse,
  StaffModerationReport,
  StaffModerationReportCluster,
  StaffModerationReportDuplicateCluster,
} from './api/client/reports-contracts'
import type { CommunityBanEvasionContext } from '@/types/api-responses'

export type ModerationReport = StaffModerationReport
export type ServerModerationReportReasonBreakdown = StaffModerationReportCluster['reason_breakdown']
export type ServerModerationReportClusterIndicators = ModerationReportClusterIndicators
export type ModerationReportCluster = StaffModerationReportCluster
export type ModerationReportDuplicateCluster = StaffModerationReportDuplicateCluster

export type CommunityModerationReport = Omit<
  StaffModerationReport,
  'entity_type' | 'reporter_user_id' | 'reporter_username'
> & {
  entity_type: 'post' | 'comment' | 'user'
  community_ban_evasion?: CommunityBanEvasionContext | null
}

export interface CommunityModerationReportsResponse {
  reports: CommunityModerationReport[]
  page_info?: import('@/types/api-responses').PageInfo
}

export type ServerModerationReportsResponse =
  | StaffFlatModerationReportsResponse
  | MemberFlatModerationReportsResponse
export type ServerClusteredModerationReportsResponse = StaffClusteredModerationReportsResponse

export interface ServerGetModerationReportsOptions {
  searchParams?: {
    limit?: number
    after?: string
    before?: string
    status?: string
    sort?: 'severity' | 'most_reported' | 'created_at_asc' | 'created_at_desc'
    cluster?: 'entity'
  }
  headers?: Record<string, string>
}
