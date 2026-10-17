/** Namespaced so a row's deduplication id can never collide with another domain's. */
export const USER_RSS_FEED_IMPORT_ROW_DEDUP_PREFIX = 'imports.processUserRssFeedImportRow'

/** Job ids may not contain colons, so the domain prefix uses an underscore. */
export const USER_RSS_FEED_IMPORT_DISPATCH_ID_PREFIX = 'imports_dispatchUserRssFeedImport'

export {
  IMPORT_RECOVERY_CRON,
  IMPORT_RECOVERY_STALE_MS,
} from '@queues/background/enqueues/imports-jobs'
