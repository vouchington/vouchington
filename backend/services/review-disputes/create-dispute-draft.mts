import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
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

/**
 * Saves the draft and completes the run in one statement. The run row is locked because it is
 * written, so a delayed failure marker either lands first (nothing saves) or finds it complete.
 * Returns null when the run no longer applies (already finished, or the dispute left drafting).
 */
export async function createReviewDisputeDraft(input: AiDraftInput): Promise<ReviewDispute | null> {
  const now = new Date()
  const { rows } = await write<ReviewDispute>(sql`/* createReviewDisputeDraft */
    WITH lifecycle_change_id AS (
      SELECT uuidv7() AS id
    ),
    updated AS (
      UPDATE review_disputes
      SET recommended_action = ${input.recommendedAction},
          ai_public_response = ${input.aiPublicResponse},
          ai_internal_response = ${input.aiInternalResponse},
          model = ${input.model},
          ai_drafted_at = ${now},
          public_response = ${input.aiPublicResponse},
          drafted_at = COALESCE(drafted_at, ${now}),
          latest_lifecycle_change_id = (SELECT id FROM lifecycle_change_id)
      WHERE id = ${input.disputeId}
        AND approved_at IS NULL
        AND sent_at IS NULL
        AND resolved_at IS NULL
        AND EXISTS (
          SELECT 1 FROM review_dispute_resolution_runs run
          WHERE run.id = ${input.runId}::uuid AND run.review_dispute_id = review_disputes.id
            AND run.completed_at IS NULL AND run.failed_at IS NULL AND run.expired_at IS NULL
          FOR UPDATE
        )
      RETURNING
        id, post_id, topic_id, disputant_user_id, reason, claim_text,
        CASE
          WHEN resolved_at IS NULL THEN 'pending'
          WHEN resolution_action = 'dismiss' THEN 'dismissed'
          ELSE 'resolved'
        END AS status,
        recommended_action, ai_public_response, ai_internal_response, model, ai_drafted_at,
        public_response, internal_notes, drafted_at, edited_at, edited_by_id,
        approved_at, approved_by_id, sent_at, resolved_at, resolved_by_id,
        resolution_action, latest_lifecycle_change_id, updated_at
    ),
    inserted_change AS (
      INSERT INTO review_dispute_lifecycle_changes (
        id,
        review_dispute_id,
        change_type,
        changed_by_id,
        metadata
      )
      SELECT
        lifecycle_change_id.id,
        updated.id,
        'ai_draft',
        NULL,
        ${JSON.stringify({ model: input.model, recommended_action: input.recommendedAction, run_id: input.runId })}::jsonb
      FROM updated
      CROSS JOIN lifecycle_change_id
    ),
    completed_run AS (
      UPDATE review_dispute_resolution_runs run
      SET completed_at = ${now},
          ai_drafted_at = ${now},
          latest_lifecycle_change_id = updated.latest_lifecycle_change_id
      FROM updated
      WHERE run.id = ${input.runId}::uuid
        AND run.review_dispute_id = updated.id
      RETURNING run.id
    )
    SELECT * FROM updated
  `)
  const result = rows[0]
  if (result) return result
  const { rows: current } = await write<{ id: string }>(sql`
    /* createReviewDisputeDraft:checkDispute */
    SELECT id FROM review_disputes WHERE id = ${input.disputeId}
  `)
  assert(current[0], 404, 'Dispute not found')
  return null
}
