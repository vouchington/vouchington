import type { PageInfo } from './api-responses'
import type {
  IntegrityFlagStatusFilter,
  ReportIntegrityFlagType,
  ReportIntegrityPatchResolution,
  ReportIntegrityResolution,
} from '@ts-shared/utils/moderation-catalogs'

export type StatusFilter = IntegrityFlagStatusFilter
export type FlagResolution = ReportIntegrityPatchResolution

export interface ReportIntegrityFlag {
  id: string
  post_id: string | null
  reported_user_id: string | null
  hostname_id: string | null
  hostname: string | null
  entity_label: string
  reported_username: string | null
  resolver_username: string | null
  resolver_display_name: string | null
  rss_feed_item_id: string | null
  flag_type: ReportIntegrityFlagType
  reporter_count: number
  new_account_reporter_percent: number
  details: Record<string, unknown>
  resolved_at: string | null
  resolved_by_id: string | null
  resolution: ReportIntegrityResolution | null
  created_at: string
}

export interface ReportIntegrityFlagsResponse {
  results: ReportIntegrityFlag[]
  page_info: {
    has_next_page: boolean
    end_cursor: string | null
    start_cursor: string | null
  }
}

export type IntegrityPenaltyStatusFilter = 'active' | 'revoked' | 'all'

export interface ReportIntegrityPenalty {
  id: string
  user_id: string
  user_username: string | null
  user_display_name: string | null
  creator_username: string | null
  creator_display_name: string | null
  revoker_username: string | null
  revoker_display_name: string | null
  source_flag_type: string | null
  reason: string
  source_flag_id: string | null
  created_by_id: string | null
  revoked_at: string | null
  revoked_by_id: string | null
  reviewed_at: string | null
  reviewed_by_id: string | null
  review_due_at: string
  created_at: string
  updated_at: string
}

export interface ReportIntegrityPenaltiesResponse {
  results: ReportIntegrityPenalty[]
  page_info: ReportIntegrityFlagsResponse['page_info']
}

interface ReportIntegrityPenaltyReviewDue extends ReportIntegrityPenalty {
  user_username: string | null
}

export interface ReportIntegrityPenaltyReviewsDueResponse {
  results: ReportIntegrityPenaltyReviewDue[]
  page_info: PageInfo
}
