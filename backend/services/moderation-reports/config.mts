import createHttpError from 'http-errors'
import type {
  ModerationReportEntityType,
  ModerationReportReason,
} from '@ts-shared/utils/moderation-reports'
import {
  MODERATION_REPORT_RESOLUTION_STATUSES,
  MODERATION_REPORT_STATUSES,
  type ModerationReportResolutionStatus,
  type ModerationReportStatus,
} from '@ts-shared/utils/moderation-catalogs'

export {
  MODERATION_REPORT_ENTITY_TYPES,
  MODERATION_REPORT_REASONS,
  MODERATION_REPORT_REASON_SEVERITY_RANK,
  type ModerationReportEntityType,
  type ModerationReportReason,
} from '@ts-shared/utils/moderation-reports'
export {
  MODERATION_REPORT_RESOLUTION_STATUSES,
  MODERATION_REPORT_STATUSES,
  type ModerationReportResolutionStatus,
  type ModerationReportStatus,
}

export type CommunityBanEvasionContext = {
  community_id: string
  community_slug: string
  source_user_id: string
  source_username: string | null
  score: number
  flagged_at: string
}

/** Mapping from entity type to the FK column in moderation_reports / moderation_report_judgements. */
export const ENTITY_TYPE_TO_REPORT_FK: Record<string, string> = {
  post: 'post_id',
  comment: 'post_id', // comments are posts with post_type='comment'
  user: 'reported_user_id',
  url_hostname: 'hostname_id',
  rss_feed_item: 'rss_feed_item_id',
}

export const MODERATION_REPORT_FK_COLUMNS = Object.freeze([
  ...new Set(Object.values(ENTITY_TYPE_TO_REPORT_FK)),
])

/** Returns the FK column name for the given entity type, throwing 422 if unknown. */
export function reportEntityFkColumn(entityType: ModerationReportEntityType): string {
  const col = ENTITY_TYPE_TO_REPORT_FK[entityType]
  if (!col) throw createHttpError(422, `Unknown moderation report entity type: ${entityType}`)
  return col
}

export interface ModerationReport {
  id: string
  case_id: string
  created_at: Date
  reviewed_at: Date | null
  /** System-generated reports use the 'ban-evasion' system user. */
  reporter_user_id: string
  reporter_username?: string | null
  entity_type: ModerationReportEntityType
  entity_id: string
  reason: ModerationReportReason
  note: string | null
  status: ModerationReportStatus
  resolved_by_id: string | null
  /** True when this report was created by the system rather than a user. */
  is_system_generated?: boolean
}
