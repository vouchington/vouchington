import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

/** Crash-recovery window for a claimed job, not a runtime cap: exports and deletions run long. */
export const ACCOUNT_LIFECYCLE_LOCK_DURATION_MS = 600_000

// Account processing and reconciliation share one global singleton-safe domain lane.
export const ACCOUNT_LIFECYCLE_DOMAIN = defineBackgroundDomain({
  domain: 'account-lifecycle',
  workerConcurrency: 2,
})

export type AccountLifecycleExportRequestData = {
  requestId: string
  userId: string
  processingAttemptId: string
}
export type AccountLifecycleUserDeletionData = {
  requestId: string
  processingAttemptId: string
}
type EmptyData = Record<string, never>

const RETRY = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
  lockDuration: ACCOUNT_LIFECYCLE_LOCK_DURATION_MS,
} as const

export const ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB =
  defineBackgroundJob<AccountLifecycleExportRequestData>(ACCOUNT_LIFECYCLE_DOMAIN, {
    name: 'processExportRequest',
    priority: PRIORITY_TASK,
    ...RETRY,
  })
export const ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB = defineBackgroundJob<EmptyData>(
  ACCOUNT_LIFECYCLE_DOMAIN,
  { name: 'processCleanupExpiredExports', priority: PRIORITY_DISPATCH, ...RETRY },
)
export const ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB = defineBackgroundJob<EmptyData>(
  ACCOUNT_LIFECYCLE_DOMAIN,
  { name: 'recoverExportRequests', priority: PRIORITY_DISPATCH, ...RETRY },
)
export const ACCOUNT_LIFECYCLE_USER_DELETION_JOB =
  defineBackgroundJob<AccountLifecycleUserDeletionData>(ACCOUNT_LIFECYCLE_DOMAIN, {
    name: 'processUserDeletion',
    priority: PRIORITY_TASK,
    ...RETRY,
  })
export const ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB = defineBackgroundJob<EmptyData>(
  ACCOUNT_LIFECYCLE_DOMAIN,
  { name: 'recoverUserDeletions', priority: PRIORITY_DISPATCH, ...RETRY },
)

export const ACCOUNT_LIFECYCLE_JOBS = [
  ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB,
  ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB,
  ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB,
  ACCOUNT_LIFECYCLE_USER_DELETION_JOB,
  ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB,
] as const
