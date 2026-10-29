import type { ModerationRecordCleanupKind } from '@voucha/types/entities/moderation-retention'

export type PsqlJobs =
  | 'runMigrations'
  | 'runViews'
  | 'runConfigDriven'
  | 'createPartitions'
  | 'cleanupPartitions'
  | 'dataRetentionCleanup'
  | 'cleanupTerminalActivityIdentities'
  | 'moderationRetentionCleanup'
  | 'aiRetentionContinuation'
  | 'continueVoteRetentionCleanup'
  | 'cleanupDeletedConversations'
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

export type TerminalActivityRetentionData = {
  family: 'follow' | 'like'
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

export const AI_RETENTION_FAMILIES = [
  'textEmbeddingCache',
  'terminalEmbeddingBatches',
  'oldMediaDeliveryChanges',
] as const

export type AIRetentionFamily = (typeof AI_RETENTION_FAMILIES)[number]
export type AIRetentionContinuationData = { family: AIRetentionFamily }

export const COPYRIGHT_RETENTION_FAMILIES = [
  'copyrightFormScreeningAttempts',
  'copyrightActionAttempts',
  'copyrightDeliveryAttempts',
  'copyrightGuestCapabilities',
  'copyrightUnlinkedEmailIntakes',
  'copyrightCaseThreads',
  'copyrightOrphanEmailThreadTokens',
] as const

export type CopyrightRetentionFamily = (typeof COPYRIGHT_RETENTION_FAMILIES)[number]

/** UTC calendar boundaries for one operator-managed, half-open UUIDv7 batch range. */
export type ClassifierPartitionRange = {
  fromDate: string
  toDate: string
  maxDefaultRows?: number
}

export type PsqlPartitionJobData = {
  classifierRange?: ClassifierPartitionRange
  requestRange?: ClassifierPartitionRange
}

export type PsqlRetentionJobData = {
  continuation?: {
    runId: string
    step: number
    activeClassifierSweeps: string[]
    activeMembershipFamilies: string[]
    /** A copyright continuation runs only these pending families, without another daily sweep. */
    copyrightFamilies?: CopyrightRetentionFamily[]
    /** Bounded final-purge cursor; the continuation job is sensitive because it names a user. */
    userPurge?: { userId: string; communityId: string; afterModeratorId: string }
  }
}

export type VoteRetentionContinuationData = {
  voteTables: string[]
  userAgentStrings: boolean
  voteIntegrityDetails: boolean
}
