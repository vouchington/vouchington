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

export type ModerationCleanupKind = (typeof MODERATION_CLEANUP_KINDS)[number]
