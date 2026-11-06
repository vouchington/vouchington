import type { FiniteValue } from '@data-stores/psql/finite-values/index'

export type ModerationCleanupKind = FiniteValue<'moderation_record_cleanup_kinds'>

export type ModerationHistoryCleanupKind = Extract<
  ModerationCleanupKind,
  'reports' | 'cases' | 'appeals' | 'disputes' | 'actions' | 'training_feedbacks' | 'judgements'
>

export type ModerationSanctionCleanupKind = Exclude<
  ModerationCleanupKind,
  ModerationHistoryCleanupKind
>
