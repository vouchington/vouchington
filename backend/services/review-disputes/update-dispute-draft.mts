import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { ReviewDisputeResponse } from './types.mts'
import { getReviewDisputeAfterMutation } from './get.mts'

export interface UpdateDisputeDraftInput {
  publicResponse?: string
  internalNotes?: string
}

export async function updateReviewDisputeDraft(
  staffUserId: string,
  disputeId: string,
  input: UpdateDisputeDraftInput,
): Promise<ReviewDisputeResponse> {
  assert(
    input.publicResponse !== undefined || input.internalNotes !== undefined,
    422,
    'At least one of public_response or internal_notes is required',
  )
  const now = new Date()
  const { rows } = await write(sql`/* updateReviewDisputeDraft */
    WITH lifecycle_change_id AS (
      SELECT uuidv7() AS id
    ),
    updated AS (
      UPDATE review_disputes
      SET public_response = COALESCE(${input.publicResponse ?? null}, public_response),
          internal_notes = COALESCE(${input.internalNotes ?? null}, internal_notes),
          edited_at = ${now},
          edited_by_id = ${staffUserId},
          approved_at = NULL,
          approved_by_id = NULL,
          latest_lifecycle_change_id = (SELECT id FROM lifecycle_change_id),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${disputeId}
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
        'edit',
        ${staffUserId},
        updated.drafted_at,
        updated.edited_at,
        updated.approved_at,
        updated.sent_at,
        updated.resolved_at,
        updated.resolution_action,
        '{}'::jsonb
      FROM updated
      CROSS JOIN lifecycle_change_id
    )
    SELECT * FROM updated
  `)
  const result = rows[0] as { id: string } | undefined
  assert(result, 404, 'Dispute not found or already sent')
  return getReviewDisputeAfterMutation(disputeId)
}
