import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { ReviewDispute, ReviewDisputeRecommendedAction } from './config.mts'

export interface AiDraftInput {
  disputeId: string
  recommendedAction: ReviewDisputeRecommendedAction
  aiPublicResponse: string
  aiInternalResponse: string
  model: string
}

export async function createReviewDisputeDraft(input: AiDraftInput): Promise<ReviewDispute> {
  const now = new Date()
  const { rows } = await write(sql`/* createReviewDisputeDraft */
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
          latest_lifecycle_change_id = (SELECT id FROM lifecycle_change_id),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${input.disputeId}
        AND approved_at IS NULL
        AND sent_at IS NULL
        AND resolved_at IS NULL
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
        drafted_at,
        edited_at,
        approved_at,
        sent_at,
        resolved_at,
        resolution_action,
        metadata
      )
      SELECT
        lifecycle_change_id.id,
        updated.id,
        'ai_draft',
        NULL,
        updated.drafted_at,
        updated.edited_at,
        updated.approved_at,
        updated.sent_at,
        updated.resolved_at,
        updated.resolution_action,
        ${JSON.stringify({ model: input.model, recommended_action: input.recommendedAction })}::jsonb
      FROM updated
      CROSS JOIN lifecycle_change_id
    )
    SELECT * FROM updated
  `)
  const result = rows[0] as ReviewDispute | undefined
  assert(result, 404, 'Dispute not found, already approved, sent, or resolved')
  return result
}
