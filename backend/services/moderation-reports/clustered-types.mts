import type {
  ModerationReportEntityType,
  ModerationReportReason,
  ModerationReportStatus,
} from './config.mts'
import type { PendingModerationReport } from './get.mts'
import type { ModerationReportTargetContent } from './target-metadata.mts'
import type { ModerationReportSort } from './sort-sql.mts'

export type ModerationReportReasonBreakdown = Array<{
  reason: ModerationReportReason
  count: number
}>

export type ModerationReportClusterIndicators = {
  content_hash_duplicate: boolean
  embeddings_similarity: boolean
  velocity_spike: boolean
}

export type ModerationReportEntityCluster = {
  id: string
  entity_type: ModerationReportEntityType
  entity_id: string
  report_count: number
  reporter_count: number
  reason_breakdown: ModerationReportReasonBreakdown
  first_reported_at: Date
  last_reported_at: Date
  target_label: string | null
  target_content: ModerationReportTargetContent | null
  target_path: string | null
  admin_action_path: string | null
  target_user_id: string | null
  target_available: boolean | null
  target_is_restricted: boolean
  indicators: ModerationReportClusterIndicators
  reports: PendingModerationReport[]
}

export type ModerationReportDuplicateCluster = {
  id: string
  signal: 'content_hash_duplicate' | 'embeddings_similarity'
  post_count: number
  report_count: number
  reason_breakdown: ModerationReportReasonBreakdown
  first_reported_at: Date
  last_reported_at: Date
  clusters: ModerationReportEntityCluster[]
}

export type ClusteredModerationReportsResponse = {
  cluster_mode: 'entity'
  results: ModerationReportEntityCluster[]
  duplicate_clusters: ModerationReportDuplicateCluster[]
  page_info: {
    has_next_page: boolean
    has_previous_page: boolean
    start_cursor: string | null
    end_cursor: string | null
  }
}

export type ListClusteredModerationReportsOptions = {
  limit: number
  cursorScope: string
  status?: ModerationReportStatus
  sort?: ModerationReportSort
  beforeCursor?: {
    createdAt: string
    entityType?: string
    id: string
    sort?: ModerationReportSort
  } | null
  cursorDirection?: 'after' | 'before'
}

export type ClusterRow = {
  entity_type: ModerationReportEntityType
  entity_id: string
  report_count: number
  reporter_count: number
  reason_counts: Record<string, number> | null
  first_reported_at: Date
  last_reported_at: Date
  cursor_created_at: string
  admin_action_path: string | null
  target_label: string | null
  target_content: ModerationReportTargetContent | null
  target_path: string | null
  target_user_id: string | null
  target_available: boolean | null
  target_is_restricted: boolean
}

export type SelectClusterRowsOptions = Pick<
  ListClusteredModerationReportsOptions,
  'limit' | 'beforeCursor' | 'cursorDirection'
> & { sortAsc: boolean; status: ModerationReportStatus }

export type PostIndicatorsById = Map<
  string,
  {
    indicators: ModerationReportClusterIndicators
    contentHashHex: string | null
  }
>
