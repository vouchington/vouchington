export const MODERATION_APPEAL_STATUSES = ['pending', 'resolved', 'dismissed'] as const
export type ModerationAppealStatus = (typeof MODERATION_APPEAL_STATUSES)[number]

export const MODERATION_APPEAL_ACTIONS = ['accept', 'deny', 'reduce'] as const
export type ModerationAppealAction = (typeof MODERATION_APPEAL_ACTIONS)[number]

export const REVIEW_DISPUTE_REASONS = [
  'factually_inaccurate',
  'defamatory',
  'impersonation',
  'privacy_violation',
  'other',
] as const
export type ReviewDisputeReason = (typeof REVIEW_DISPUTE_REASONS)[number]

export const REVIEW_DISPUTE_STATUSES = ['pending', 'resolved', 'dismissed'] as const
export type ReviewDisputeStatus = (typeof REVIEW_DISPUTE_STATUSES)[number]

export const REVIEW_DISPUTE_ACTIONS = ['no_action', 'remove', 'annotate', 'dismiss'] as const
export type ReviewDisputeAction = (typeof REVIEW_DISPUTE_ACTIONS)[number]
export type ReviewDisputeRecommendedAction = ReviewDisputeAction

export const REVIEW_DISPUTE_RESOLUTION_ACTIONS = ['remove', 'annotate', 'dismiss'] as const
export type ReviewDisputeResolutionAction = (typeof REVIEW_DISPUTE_RESOLUTION_ACTIONS)[number]

export const MODERATION_REPORT_STATUSES = ['pending', 'reviewed', 'actioned', 'dismissed'] as const
export type ModerationReportStatus = (typeof MODERATION_REPORT_STATUSES)[number]

export const MODERATION_REPORT_RESOLUTION_STATUSES = ['reviewed', 'dismissed'] as const
export type ModerationReportResolutionStatus =
  (typeof MODERATION_REPORT_RESOLUTION_STATUSES)[number]

export const REPORT_INTEGRITY_FLAG_TYPES = ['mass_report_suspected'] as const
export type ReportIntegrityFlagType = (typeof REPORT_INTEGRITY_FLAG_TYPES)[number]

export const REPORT_INTEGRITY_RESOLUTIONS = ['dismissed', 'penalized'] as const
export type ReportIntegrityResolution = (typeof REPORT_INTEGRITY_RESOLUTIONS)[number]

export const REPORT_INTEGRITY_PATCH_RESOLUTIONS = ['dismissed'] as const
export type ReportIntegrityPatchResolution = (typeof REPORT_INTEGRITY_PATCH_RESOLUTIONS)[number]

export const VOTE_INTEGRITY_FLAG_TYPES = ['velocity_spike', 'ip_correlation'] as const
export type VoteIntegrityFlagType = (typeof VOTE_INTEGRITY_FLAG_TYPES)[number]

export const VOTE_INTEGRITY_RESOLUTIONS = ['dismissed', 'penalized', 'suspended'] as const
export type VoteIntegrityResolution = (typeof VOTE_INTEGRITY_RESOLUTIONS)[number]

export const INTEGRITY_FLAG_STATUSES = ['pending', 'resolved'] as const
export type IntegrityFlagStatus = (typeof INTEGRITY_FLAG_STATUSES)[number]

export const INTEGRITY_FLAG_STATUS_FILTERS = ['pending', 'resolved', 'all'] as const
export type IntegrityFlagStatusFilter = (typeof INTEGRITY_FLAG_STATUS_FILTERS)[number]

export const MODERATOR_ACTION_TYPES = [
  'remove',
  'approve',
  'reject',
  'ban',
  'lift_ban',
  'activate_restriction',
  'lift_restriction',
  'warn',
  'lock',
  'unlock',
  'pin',
  'unpin',
  'tag',
  'suspend',
  'unsuspend',
  'remove_member',
  'change_role',
  'resolve_report',
  'dismiss_report',
  'resolve_appeal',
  'dismiss_appeal',
] as const
export type ModeratorActionType = (typeof MODERATOR_ACTION_TYPES)[number]
