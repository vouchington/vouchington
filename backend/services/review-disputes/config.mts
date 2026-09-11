import {
  REVIEW_DISPUTE_ACTIONS,
  REVIEW_DISPUTE_REASONS,
  REVIEW_DISPUTE_RESOLUTION_ACTIONS,
  REVIEW_DISPUTE_STATUSES,
  type ReviewDisputeAction,
  type ReviewDisputeReason,
  type ReviewDisputeRecommendedAction,
  type ReviewDisputeResolutionAction,
  type ReviewDisputeStatus,
} from '@ts-shared/utils/moderation-catalogs'

export {
  REVIEW_DISPUTE_ACTIONS,
  REVIEW_DISPUTE_REASONS,
  REVIEW_DISPUTE_RESOLUTION_ACTIONS,
  REVIEW_DISPUTE_STATUSES,
  type ReviewDisputeAction,
  type ReviewDisputeReason,
  type ReviewDisputeRecommendedAction,
  type ReviewDisputeResolutionAction,
  type ReviewDisputeStatus,
}

/** SLA in hours: disputes must be reviewed within this window. */
export const DISPUTE_SLA_HOURS = 72

export const REVIEW_DISPUTE_CHANGE_TYPES = [
  'create',
  'ai_draft',
  'edit',
  'approve',
  'send',
  'resolve_remove',
  'resolve_annotate',
  'dismiss',
] as const
export type ReviewDisputeChangeType = (typeof REVIEW_DISPUTE_CHANGE_TYPES)[number]

// Relocated to @voucha/types (pure config data, no service dependencies) so that
// backend/test-helpers can use this type without creating a
// test-helpers -> services workspace cycle. Re-exported here for call-site stability.
export type { ReviewDispute } from '@voucha/types/entities/review-dispute'

export interface PostDisputeAnnotation {
  id: string
  post_id: string
  review_dispute_id: string
  body_text: string
  created_by_id: string
  removed_at: Date | null
  removed_by_id: string | null
  created_at: Date
}
