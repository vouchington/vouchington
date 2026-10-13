export const QUEUE_NAME = 'account-lifecycle'
export const PRIORITY_DEFAULT = 10
export const PRIORITY_BACKGROUND = 100
export const LOCK_DURATION_MS = 600_000

export const DATA_EXPORT_EXPIRY_DAYS = 7

export const CLEANUP_SCHEDULER_ID = 'account-data-requests-cleanup'
// Hourly
export const CLEANUP_CRON = '0 * * * *'
export const USER_DELETIONS_RECOVERY_INTERVAL_MS = 300_000
