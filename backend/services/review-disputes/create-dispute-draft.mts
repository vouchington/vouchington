import {
  saveRunGatedAiDraft,
  type RunGatedDraftSpec,
} from '@services/moderator-actions/ai-draft-save'
import type { ReviewDispute, ReviewDisputeRecommendedAction } from './config.mts'

export interface AiDraftInput {
  disputeId: string
  /** The admitted resolution run; only an active run may save a draft. */
  runId: string
  recommendedAction: ReviewDisputeRecommendedAction
  aiPublicResponse: string
  aiInternalResponse: string
  model: string
}

const DISPUTE_DRAFT_SPEC: RunGatedDraftSpec = {
  name: 'createReviewDisputeDraft',
  table: 'review_disputes',
  lifecycleTable: 'review_dispute_lifecycle_changes',
  runsTable: 'review_dispute_resolution_runs',
  parentColumn: 'review_dispute_id',
  requestedRunColumn: null,
  requireActiveRun: true,
  clearApproval: false,
  returning: `id, post_id, topic_id, disputant_user_id, reason, claim_text,
CASE
  WHEN resolved_at IS NULL THEN 'pending'
  WHEN resolution_action = 'dismiss' THEN 'dismissed'
  ELSE 'resolved'
END AS status,
recommended_action, ai_public_response, ai_internal_response, model, ai_drafted_at,
public_response, internal_notes, drafted_at, edited_at, edited_by_id,
approved_at, approved_by_id, sent_at, resolved_at, resolved_by_id,
resolution_action, latest_lifecycle_change_id, updated_at`,
  notFoundMessage: 'Dispute not found',
}

/**
 * Saves the draft and completes the run in one statement (see saveRunGatedAiDraft). The run row is locked because it is
 * written, so a delayed failure marker either lands first (nothing saves) or finds it complete.
 * Returns null when the run no longer applies (already finished, or the dispute left drafting).
 */
export function createReviewDisputeDraft(input: AiDraftInput): Promise<ReviewDispute | null> {
  return saveRunGatedAiDraft<ReviewDispute>(DISPUTE_DRAFT_SPEC, {
    ...input,
    parentId: input.disputeId,
  })
}
