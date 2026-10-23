import type { ModerationRecordCleanupKind } from '@voucha/types/entities/moderation-retention'

export type PsqlJobs =
  | 'runMigrations'
  | 'runViews'
  | 'runConfigDriven'
  | 'createPartitions'
  | 'cleanupPartitions'
  | 'dataRetentionCleanup'
  | 'moderationRetentionCleanup'
  | 'refreshMaterializedView'
  | 'reconcileVoteDrift'

export const PSQL_MANUAL_ONLY_ADMIN_JOB_TYPES = [
  'runMigrations',
  'runViews',
  'runConfigDriven',
] as const satisfies readonly PsqlJobs[]

export const PSQL_SCHEDULED_ADMIN_JOB_TYPES = [
  'createPartitions',
  'cleanupPartitions',
] as const satisfies readonly PsqlJobs[]

export const PSQL_ADMIN_JOB_TYPES = [
  ...PSQL_MANUAL_ONLY_ADMIN_JOB_TYPES,
  ...PSQL_SCHEDULED_ADMIN_JOB_TYPES,
] as const

export type PsqlAdminJobType = (typeof PSQL_ADMIN_JOB_TYPES)[number]

export type RefreshMaterializedViewData = {
  viewName: string
}

export type ModerationRetentionJobData = {
  rootJobId?: string
  hop?: number
  remainingKinds?: ModerationRecordCleanupKind[]
  receipt?: {
    deleted: number
    hasMore: boolean
    remainingKinds: ModerationRecordCleanupKind[]
  }
}

/** UTC calendar boundaries for one operator-managed, half-open UUIDv7 batch range. */
export type ClassifierPartitionRange = {
  fromDate: string
  toDate: string
  maxDefaultRows?: number
}

export type PsqlPartitionJobData = {
  classifierRange?: ClassifierPartitionRange
}
