import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob, entityOrderingKey } from './define-job.mts'

export const HOSTNAME_BLOCKING_DOMAIN = defineBackgroundDomain({
  domain: 'hostname-blocking',
  workerConcurrency: 2,
})

export const HOSTNAME_BLOCKING_ORDERING = {
  task: { key: 'hostname-blocking' },
  dispatcher: { key: entityOrderingKey('hostname-blocking', 'dispatcher') },
} as const

export const HOSTNAME_BLOCKING_RECOVERY_SCHEDULE = '*/5 * * * *'

export type HostnameBlockCleanupData = {
  blockId: string
  progress: number
  cursor?: HostnameBlockCleanupCursor
}

export type HostnameBlockCleanupCursor =
  | { stage: 'subdomains'; afterReversedHostname?: string }
  | {
      stage: 'relations'
      afterReversedHostname?: string
      hostnames?: HostnameBlockCleanupHostname[]
      hostnameIndex?: number
      hostnamesExhausted?: boolean
      urlAfterId?: string
      urlIds?: string[]
      urlsExhausted?: boolean
      tableIndex?: number
      relationAfter?: { objectId: string; subjectId: string }
    }
  | { stage: 'penalties'; afterUserId?: string }

export type HostnameBlockCleanupHostname = {
  id: string
  reversedHostname: string
  owned: boolean
}

export type HostnameBlockRecoveryData = {
  afterBlockId?: string
}

const RETRY = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
} as const

export const HOSTNAME_BLOCKING_PROCESS_JOB = defineBackgroundJob<HostnameBlockCleanupData>(
  HOSTNAME_BLOCKING_DOMAIN,
  { name: 'processBlock', priority: PRIORITY_TASK, sensitive: true, ...RETRY },
)

export const HOSTNAME_BLOCKING_RECOVERY_JOB = defineBackgroundJob<HostnameBlockRecoveryData>(
  HOSTNAME_BLOCKING_DOMAIN,
  {
    name: 'recoverBlocks',
    priority: PRIORITY_DISPATCH,
    ordering: HOSTNAME_BLOCKING_ORDERING.dispatcher,
    ...RETRY,
  },
)

export const HOSTNAME_BLOCKING_JOBS = [
  HOSTNAME_BLOCKING_PROCESS_JOB,
  HOSTNAME_BLOCKING_RECOVERY_JOB,
] as const
