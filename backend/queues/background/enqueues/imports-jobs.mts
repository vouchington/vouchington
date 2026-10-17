import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// The two old queues each ran a worker of 5, so the domain shares one group of 10. A cap is kept
// (rather than none) because a row fetches an arbitrary third-party feed host: without one a large
// import would hold every slot of the shared worker pool. Rows reach independent hosts, so a pause
// or rate-limit signal delays only its own job. A dispatcher belongs to the same group: it is
// cheap, and an import never has more than one on the queue at a time.
export const IMPORTS_DOMAIN = defineBackgroundDomain({
  domain: 'imports',
  group: { kind: 'domain', concurrency: 10, deferral: 'job' },
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

/** Imports one recovery sweep re-dispatches; the next sweep takes the rest. */
export const IMPORT_RECOVERY_BATCH_SIZE = 100

export const IMPORT_RECOVERY_CRON = '*/5 * * * *'

/** Re-dispatches imports whose dispatcher failed every attempt; see `recoverStalledImports`. */
export const IMPORTS_RECOVER_STALLED_JOB = defineBackgroundJob<Record<string, never>>(
  IMPORTS_DOMAIN,
  {
    name: 'recoverStalledImports',
    priority: PRIORITY_DISPATCH,
    backoff: ADMIN_BACKOFF,
    ...DEFAULTS,
  },
)

export const IMPORTS_JOBS = [
  IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB,
  IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB,
  IMPORTS_DISPATCH_ADMIN_TOPIC_IMPORT_JOB,
  IMPORTS_PROCESS_ADMIN_TOPIC_IMPORT_ROW_JOB,
  IMPORTS_RECOVER_STALLED_JOB,
] as const
