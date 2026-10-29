/** Fixed family vocabulary in cleanup dependency order. */
export const MODERATION_CLEANUP_KINDS = [
  'judgements',
  'training_feedbacks',
  'appeals',
  'disputes',
  'warnings',
  'suspensions',
  'bans',
  'reports',
  'cases',
  'actions',
  'integrity_flags',
  'report_penalties',
  'vote_penalties',
  'notes',
  'applications',
] as const

export type ModerationRecordCleanupKind = (typeof MODERATION_CLEANUP_KINDS)[number]

export const POST_MODERATION_RETENTION_KINDS = ['superseded_versions', 'pass_evidence'] as const
export type PostModerationRetentionKind = (typeof POST_MODERATION_RETENTION_KINDS)[number]
