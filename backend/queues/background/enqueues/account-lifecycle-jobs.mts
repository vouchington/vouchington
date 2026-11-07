import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import type { NamedQueueJob } from '@data-stores/valkey-glide-mq'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'
import type { BackgroundJobDefinition } from '../types.mts'

/** Crash-recovery window for a claimed job, not a runtime cap: exports and deletions run long. */
export const ACCOUNT_LIFECYCLE_LOCK_DURATION_MS = 600_000

// Account processing and reconciliation share one global singleton-safe domain lane.
const ACCOUNT_LIFECYCLE_DOMAIN_NAME = 'account-lifecycle' as const
const ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB_LOCAL_NAME = 'processExportRequest' as const
const ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB_LOCAL_NAME = 'processCleanupExpiredExports' as const
const ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB_LOCAL_NAME = 'recoverExportRequests' as const
const ACCOUNT_LIFECYCLE_USER_DELETION_JOB_LOCAL_NAME = 'processUserDeletion' as const
const ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB_LOCAL_NAME = 'recoverUserDeletions' as const
export const ACCOUNT_LIFECYCLE_DOMAIN = defineBackgroundDomain({
  domain: ACCOUNT_LIFECYCLE_DOMAIN_NAME,
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
export type AccountLifecycleEmptyData = Record<string, never>

type AccountLifecycleLocalJobPayloads = {
  [ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB_LOCAL_NAME]: AccountLifecycleExportRequestData
  [ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB_LOCAL_NAME]: AccountLifecycleEmptyData
  [ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB_LOCAL_NAME]: AccountLifecycleEmptyData
  [ACCOUNT_LIFECYCLE_USER_DELETION_JOB_LOCAL_NAME]: AccountLifecycleUserDeletionData
  [ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB_LOCAL_NAME]: AccountLifecycleEmptyData
}

export type AccountLifecycleJobPayloads = {
  [
    TLocalName in keyof AccountLifecycleLocalJobPayloads as `${typeof ACCOUNT_LIFECYCLE_DOMAIN_NAME}.${TLocalName}`
  ]: AccountLifecycleLocalJobPayloads[TLocalName]
}

export type AccountLifecycleJob = NamedQueueJob<AccountLifecycleJobPayloads>

export type AccountLifecycleJobName = keyof AccountLifecycleJobPayloads

export type AccountLifecycleJobDefinition<TJobName extends AccountLifecycleJobName> =
  BackgroundJobDefinition<AccountLifecycleJobPayloads[TJobName], false> & {
    readonly name: TJobName
  }

function namedAccountLifecycleJob<TLocalName extends keyof AccountLifecycleLocalJobPayloads>(
  localName: TLocalName,
  definition: BackgroundJobDefinition<AccountLifecycleLocalJobPayloads[TLocalName], false>,
): AccountLifecycleJobDefinition<`${typeof ACCOUNT_LIFECYCLE_DOMAIN_NAME}.${TLocalName}`> {
  const name = `${ACCOUNT_LIFECYCLE_DOMAIN_NAME}.${localName}` as const
  return { ...definition, name } as AccountLifecycleJobDefinition<typeof name>
}

const RETRY = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
  lockDuration: ACCOUNT_LIFECYCLE_LOCK_DURATION_MS,
} as const

export const ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB = namedAccountLifecycleJob(
  ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB_LOCAL_NAME,
  defineBackgroundJob<
    AccountLifecycleLocalJobPayloads[typeof ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB_LOCAL_NAME]
  >(ACCOUNT_LIFECYCLE_DOMAIN, {
    name: ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB_LOCAL_NAME,
    priority: PRIORITY_TASK,
    ...RETRY,
  }),
)
export const ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB = namedAccountLifecycleJob(
  ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB_LOCAL_NAME,
  defineBackgroundJob<
    AccountLifecycleLocalJobPayloads[typeof ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB_LOCAL_NAME]
  >(ACCOUNT_LIFECYCLE_DOMAIN, {
    name: ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB_LOCAL_NAME,
    priority: PRIORITY_DISPATCH,
    ...RETRY,
  }),
)
export const ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB = namedAccountLifecycleJob(
  ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB_LOCAL_NAME,
  defineBackgroundJob<
    AccountLifecycleLocalJobPayloads[typeof ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB_LOCAL_NAME]
  >(ACCOUNT_LIFECYCLE_DOMAIN, {
    name: ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB_LOCAL_NAME,
    priority: PRIORITY_DISPATCH,
    ...RETRY,
  }),
)
export const ACCOUNT_LIFECYCLE_USER_DELETION_JOB = namedAccountLifecycleJob(
  ACCOUNT_LIFECYCLE_USER_DELETION_JOB_LOCAL_NAME,
  defineBackgroundJob<
    AccountLifecycleLocalJobPayloads[typeof ACCOUNT_LIFECYCLE_USER_DELETION_JOB_LOCAL_NAME]
  >(ACCOUNT_LIFECYCLE_DOMAIN, {
    name: ACCOUNT_LIFECYCLE_USER_DELETION_JOB_LOCAL_NAME,
    priority: PRIORITY_TASK,
    ...RETRY,
  }),
)
export const ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB = namedAccountLifecycleJob(
  ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB_LOCAL_NAME,
  defineBackgroundJob<
    AccountLifecycleLocalJobPayloads[typeof ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB_LOCAL_NAME]
  >(ACCOUNT_LIFECYCLE_DOMAIN, {
    name: ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB_LOCAL_NAME,
    priority: PRIORITY_DISPATCH,
    ...RETRY,
  }),
)

export const ACCOUNT_LIFECYCLE_JOBS = [
  ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB,
  ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB,
  ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB,
  ACCOUNT_LIFECYCLE_USER_DELETION_JOB,
  ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB,
] as const
