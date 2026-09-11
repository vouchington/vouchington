// Number of distinct reporters required to flag an entity as a mass-report target.
export const MASS_REPORT_THRESHOLD = 5

// Time window for counting reports.
export const MASS_REPORT_WINDOW_MINUTES = 60

// Account age cutoff for "new" accounts — matches YOUNG_ACCOUNT_AGE_DAYS in vote-integrity.
export const NEW_ACCOUNT_AGE_DAYS = 30

export {
  INTEGRITY_FLAG_STATUSES,
  REPORT_INTEGRITY_FLAG_TYPES,
  REPORT_INTEGRITY_PATCH_RESOLUTIONS,
  REPORT_INTEGRITY_RESOLUTIONS,
  type IntegrityFlagStatus,
  type ReportIntegrityPatchResolution,
} from '@ts-shared/utils/moderation-catalogs'

// Mapping from moderation_report entity type string to its FK column in report_integrity_flags.
// 'comment' maps to 'post_id' because comments are posts rows with post_type='comment'.
export const ENTITY_TYPE_TO_FLAG_FK: Record<string, string> = {
  post: 'post_id',
  comment: 'post_id',
  user: 'reported_user_id',
  url_hostname: 'hostname_id',
  rss_feed_item: 'rss_feed_item_id',
}
