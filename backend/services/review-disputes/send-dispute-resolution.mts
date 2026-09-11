import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { createReviewDisputeResolvedNotification } from '@services/notifications/create-review-dispute-resolved-notification'
import type { ReviewDispute } from './config.mts'
import type { ReviewDisputeResponse } from './types.mts'
import { getReviewDisputeAfterMutation, getReviewDisputeByIdFromPrimary } from './get.mts'

export async function sendApprovedReviewDisputeResolution(
  staffUserId: string,
  disputeId: string,
): Promise<ReviewDisputeResponse> {
  const dispute = await getReviewDisputeByIdFromPrimary(disputeId)
  assert(dispute, 404, 'Dispute not found')
  // Legally required invariant: approved_at MUST be set before sending
  assert(dispute.approved_at != null, 422, 'Dispute must be approved before sending')
  assert(dispute.sent_at == null, 422, 'Dispute resolution has already been sent')
  assert(dispute.public_response, 422, 'Dispute has no public response to send')

  const now = new Date()
  const { rows } = await write(sql`/* sendApprovedReviewDisputeResolution */
    WITH lifecycle_change_id AS (
      SELECT uuidv7() AS id
    ),
    updated AS (
      UPDATE review_disputes
      SET sent_at = ${now},
          latest_lifecycle_change_id = (SELECT id FROM lifecycle_change_id),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${disputeId}
        AND approved_at IS NOT NULL
        AND sent_at IS NULL
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
        'send',
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
  const result = rows[0] as ReviewDispute | undefined
  assert(result, 422, 'Dispute resolution has already been sent')

  // Deliver the human-approved response to the disputant. Awaited so a delivery
  // failure surfaces to the caller instead of being silently swallowed.
  await createReviewDisputeResolvedNotification(
    dispute.disputant_user_id,
    disputeId,
    dispute.public_response ?? '',
  )

  return getReviewDisputeAfterMutation(disputeId)
}
