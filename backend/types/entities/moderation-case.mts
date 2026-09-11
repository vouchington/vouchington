import type { ModerationReportEntityType } from '@ts-shared/utils/moderation-reports'

export type { ModerationReportEntityType }

export interface ModerationCase {
  id: string
  post_id: string | null
  reported_user_id: string | null
  hostname_id: string | null
  rss_feed_item_id: string | null
  created_at: Date
  updated_at: Date
  resolved_at: Date | null
  resolved_by_id: string | null
}

export type ModerationCaseEntity = {
  entityType: ModerationReportEntityType
  entityId: string
}

const ENTITY_TYPE_TO_CASE_FK: Record<ModerationReportEntityType, string> = {
  post: 'post_id',
  comment: 'post_id',
  user: 'reported_user_id',
  url_hostname: 'hostname_id',
  rss_feed_item: 'rss_feed_item_id',
}

/** Returns the FK column name in moderation_cases for the given entity type. */
export function caseEntityFkColumn(entityType: ModerationReportEntityType): string {
  return ENTITY_TYPE_TO_CASE_FK[entityType]
}
