import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// Domain ordering bounds third-party fetches; independent hosts defer only the signalling job.
export const IMPORTS_DOMAIN = defineBackgroundDomain({
  domain: 'imports',
  deferral: 'job',
  workerConcurrency: 10,
})

const DEFAULTS = {
  attempts: 3,
  removeOnComplete: 100,
  removeOnFail: 100,
} as const

const USER_BACKOFF = { type: 'exponential', delay: 5000, jitter: 0.5 } as const
const ADMIN_BACKOFF = { type: 'exponential', delay: 2000, jitter: 0.5 } as const

/** One page of an import's pending rows; `cursor` is the last row index of the page before it. */
export type UserRssFeedImportDispatchData = { importId: string; cursor?: number }
export type AdminTopicImportDispatchData = { batchId: string; cursor?: number }
export type UserRssFeedImportRowData = { importId: string; rowId: string }
export type AdminTopicImportRowData = { batchId: string; rowId: string }

export const IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB =
  defineBackgroundJob<UserRssFeedImportDispatchData>(IMPORTS_DOMAIN, {
    name: 'dispatchUserRssFeedImport',
    priority: PRIORITY_DISPATCH,
    backoff: USER_BACKOFF,
    ...DEFAULTS,
  })
export const IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB =
  defineBackgroundJob<UserRssFeedImportRowData>(IMPORTS_DOMAIN, {
    name: 'processUserRssFeedImportRow',
    priority: PRIORITY_TASK,
    backoff: USER_BACKOFF,
    ...DEFAULTS,
  })
export const IMPORTS_DISPATCH_ADMIN_TOPIC_IMPORT_JOB =
  defineBackgroundJob<AdminTopicImportDispatchData>(IMPORTS_DOMAIN, {
    name: 'dispatchAdminTopicImport',
    priority: PRIORITY_DISPATCH,
    backoff: ADMIN_BACKOFF,
    ...DEFAULTS,
  })
export const IMPORTS_PROCESS_ADMIN_TOPIC_IMPORT_ROW_JOB =
  defineBackgroundJob<AdminTopicImportRowData>(IMPORTS_DOMAIN, {
    name: 'processAdminTopicImportRow',
    priority: PRIORITY_TASK,
    backoff: ADMIN_BACKOFF,
    ...DEFAULTS,
  })

/** An unfinished import that made no progress for this long has lost its dispatcher. */
export const IMPORT_RECOVERY_STALE_MS = 15 * 60 * 1000

export const IMPORT_RECOVERY_CRON = '*/5 * * * *'

/** Re-dispatches imports whose dispatcher failed every attempt; see `recoverStalledImports`. */
export const IMPORTS_RECOVER_STALLED_JOB = defineBackgroundJob(IMPORTS_DOMAIN, {
  name: 'recoverStalledImports',
  priority: PRIORITY_DISPATCH,
  backoff: ADMIN_BACKOFF,
  ...DEFAULTS,
})

export const IMPORTS_JOBS = [
  IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB,
  IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB,
  IMPORTS_DISPATCH_ADMIN_TOPIC_IMPORT_JOB,
  IMPORTS_PROCESS_ADMIN_TOPIC_IMPORT_ROW_JOB,
  IMPORTS_RECOVER_STALLED_JOB,
] as const
