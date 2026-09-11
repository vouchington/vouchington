import type {
  IntegrityFlagStatusFilter,
  VoteIntegrityFlagType,
  VoteIntegrityResolution,
} from '@ts-shared/utils/moderation-catalogs'

export type { VoteIntegrityFlagType }
export type StatusFilter = IntegrityFlagStatusFilter
export type FlagResolution = VoteIntegrityResolution

export interface VoteIntegrityFlag {
  id: string
  post_id: string | null
  topic_id: string | null
  hostname_id: string | null
  rss_feed_item_id: string | null
  entity_relation_id: string | null
  agent_moderation_id: string | null
  flag_type: VoteIntegrityFlagType
  details: Record<string, unknown>
  resolved_at: string | null
  resolved_by_id: string | null
  resolution: VoteIntegrityResolution | null
  created_at: string
}

export interface VoteIntegrityFlagsResponse {
  results: VoteIntegrityFlag[]
  page_info: {
    has_next_page: boolean
    end_cursor: string | null
    start_cursor: string | null
  }
}

export type IntegrityPenaltyStatusFilter = 'active' | 'revoked' | 'all'

export interface VoteIntegrityPenalty {
  id: string
  user_id: string
  penalty_multiplier: number
  reason: string
  source_flag_id: string | null
  created_by_id: string | null
  revoked_at: string | null
  revoked_by_id: string | null
  created_at: string
}

export interface VoteIntegrityPenaltiesResponse {
  results: VoteIntegrityPenalty[]
  page_info: VoteIntegrityFlagsResponse['page_info']
  filter_scope?: {
    source: string
    source_flag_id: string | null
  }
}
