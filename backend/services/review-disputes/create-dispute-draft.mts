import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { ReviewDispute, ReviewDisputeRecommendedAction } from './config.mts'

export interface AiDraftInput {
  disputeId: string
  requestToken: string
  recommendedAction: ReviewDisputeRecommendedAction
  aiPublicResponse: string
  aiInternalResponse: string
  model: string
  runId?: string
}

export async function createReviewDisputeDraft(input: AiDraftInput): Promise<ReviewDispute | null> {
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
          ai_draft_run_id = ${input.runId ?? null},
          public_response = ${input.aiPublicResponse},
          drafted_at = COALESCE(drafted_at, ${now}),
          latest_lifecycle_change_id = (SELECT id FROM lifecycle_change_id)
      WHERE id = ${input.disputeId}
        AND ai_draft_request_token = ${input.requestToken}
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
        metadata
      )
      SELECT
        lifecycle_change_id.id,
        updated.id,
        'ai_draft',
        NULL,
        ${JSON.stringify({ model: input.model, recommended_action: input.recommendedAction, run_id: input.runId ?? null })}::jsonb
      FROM updated
      CROSS JOIN lifecycle_change_id
    )
    SELECT * FROM updated
  `)
  const result = rows[0] as ReviewDispute | undefined
  if (!result) {
    const { rows: currentRows } = await write<{ ai_draft_request_token: string }>(sql`
      /* createReviewDisputeDraft:checkRequest */
      SELECT ai_draft_request_token FROM review_disputes WHERE id = ${input.disputeId}
    `)
    if (currentRows[0] && currentRows[0].ai_draft_request_token !== input.requestToken) return null // a newer request superseded this job while it was processing
  }
  assert(result, 404, 'Dispute not found, already approved, sent, or resolved')
  return result
}

/** The row lock waits for an enqueueing transaction to commit or roll back before model IO. */
export async function isCurrentReviewDisputeDraftRequest(
  disputeId: string,
  requestToken: string,
): Promise<boolean> {
  const { rows } = await write<{
    ai_draft_request_token: string
    approved_at: Date | null
    sent_at: Date | null
    resolved_at: Date | null
  }>(sql`
    /* isCurrentReviewDisputeDraftRequest */
    SELECT ai_draft_request_token, approved_at, sent_at, resolved_at
    FROM review_disputes
    WHERE id = ${disputeId}
    FOR UPDATE
  `)
  const dispute = rows[0]
  return (
    dispute?.ai_draft_request_token === requestToken &&
    dispute.approved_at === null &&
    dispute.sent_at === null &&
    dispute.resolved_at === null
  )
}
