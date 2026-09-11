import {
  MODERATION_APPEAL_ACTIONS,
  MODERATION_APPEAL_STATUSES,
  type ModerationAppealAction,
  type ModerationAppealStatus,
} from '@ts-shared/utils/moderation-catalogs'

export {
  MODERATION_APPEAL_ACTIONS,
  MODERATION_APPEAL_STATUSES,
  type ModerationAppealAction,
  type ModerationAppealStatus,
}

export const MODERATION_APPEAL_CHANGE_TYPES = [
  'create',
  'ai_draft',
  'edit',
  'approve',
  'send',
  'resolve_accept',
  'resolve_deny',
  'resolve_reduce',
  'dismiss',
] as const
export type ModerationAppealChangeType = (typeof MODERATION_APPEAL_CHANGE_TYPES)[number]

/** SLA in hours: appeals must be reviewed within this window. */
export const APPEAL_SLA_HOURS = 72

// Relocated to @voucha/types (pure config data, no service dependencies) so that
// backend/test-helpers can use this type without creating a
// test-helpers -> services workspace cycle. Re-exported here for call-site stability.
export type { ModerationAppeal } from '@voucha/types/entities/moderation-appeal'
