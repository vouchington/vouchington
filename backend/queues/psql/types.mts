export type PsqlJobs =
  | 'runMigrations'
  | 'runViews'
  | 'runConfigDriven'
  | 'createPartitions'
  | 'cleanupPartitions'
  | 'dataRetentionCleanup'
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
