import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import onError from '@modules/on-error'
import { setPostClearanceStatus } from '@services/post-clearance'
import { recordModerationTrainingFeedback } from '@services/moderation-training'
import type { ReviewDisputeResponse } from './types.mts'
import { getReviewDisputeAfterMutation } from './get.mts'
import { appendLifecycleChange } from './lifecycle.mts'
import { logDisputeResolution } from './resolution-modlog.mts'
import { DISPUTE_RETURNING, type ReviewDisputeResolutionRow } from './resolve-shared.mts'
export { dismissPendingDisputesForDeletedReview } from './dismiss-deleted.mts'
export { dismissReviewDispute } from './dismiss-dispute.mts'

export async function resolveReviewDisputeRemove(
  staffUserId: string,
  disputeId: string,
): Promise<ReviewDisputeResponse> {
  const now = new Date()
  await using query = await beginTransaction()
  const { rows } = await query(
    sql`/* resolveReviewDisputeRemove */
      UPDATE review_disputes
      SET resolution_action = 'remove',
          resolved_at = ${now},
          resolved_by_id = ${staffUserId},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${disputeId} AND resolved_at IS NULL
      RETURNING `.append(DISPUTE_RETURNING),
  )
  const row = rows[0] as ReviewDisputeResolutionRow | undefined
  assert(row, 404, 'Dispute not found or already resolved')

  const [, lifecycleId] = await Promise.all([
    setPostClearanceStatus(row.post_id, 'rejected', staffUserId, { query }),
    appendLifecycleChange(
      disputeId,
      'resolve_remove',
      staffUserId,
      { resolved_at: row.resolved_at, resolution_action: 'remove' },
      { query },
    ),
  ])
  await query(sql`/* resolveReviewDisputeRemove:setLifecycle */
      UPDATE review_disputes SET latest_lifecycle_change_id = ${lifecycleId} WHERE id = ${disputeId}
    `)
  await recordModerationTrainingFeedback(
    {
      sourceType: 'review_dispute',
      eventType: 'dispute_resolved',
      label: 'accepted',
      humanAction: 'resolve_remove',
      actorUserId: staffUserId,
      communityId: row.community_id,
      postId: row.post_id,
      reviewDisputeId: disputeId,
      metadata: { reason: row.reason, recommended_action: row.recommended_action },
    },
    { query },
  )
  const updated = row
  await query.commit()
  await logDisputeResolution(staffUserId, 'resolve_report', disputeId, updated.post_id)
  if (updated.post_author_id) {
    import('@services/notifications/create-review-actioned-notification')
      .then(({ createReviewActionedNotification }) =>
        createReviewActionedNotification(updated.post_author_id!, disputeId, 'remove'),
      )
      .catch(onError)
  }
  return getReviewDisputeAfterMutation(disputeId)
}

export async function resolveReviewDisputeAnnotate(
  staffUserId: string,
  disputeId: string,
  bodyText: string,
): Promise<ReviewDisputeResponse> {
  assert(bodyText.trim().length > 0, 422, 'body_text is required for annotation')
  assert(bodyText.length <= 2000, 422, 'body_text too long')
  const trimmedBody = bodyText.trim()
  const now = new Date()

  await using query = await beginTransaction()
  const { rows: disputeRows } = await query(
    sql`/* resolveReviewDisputeAnnotate:resolve */
      UPDATE review_disputes
      SET resolution_action = 'annotate',
          resolved_at = ${now},
          resolved_by_id = ${staffUserId},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${disputeId} AND resolved_at IS NULL
      RETURNING `.append(DISPUTE_RETURNING),
  )
  const row = disputeRows[0] as ReviewDisputeResolutionRow | undefined
  assert(row, 404, 'Dispute not found or already resolved')

  const [lifecycleId] = await Promise.all([
    appendLifecycleChange(
      disputeId,
      'resolve_annotate',
      staffUserId,
      { resolved_at: row.resolved_at, resolution_action: 'annotate' },
      { query },
    ),
    query(sql`/* resolveReviewDisputeAnnotate:annotation */
        INSERT INTO post_dispute_annotations (post_id, review_dispute_id, body_text, created_by_id)
        VALUES (${row.post_id}, ${disputeId}, ${trimmedBody}, ${staffUserId})
        ON CONFLICT DO NOTHING
      `),
  ])
  await query(sql`/* resolveReviewDisputeAnnotate:setLifecycle */
      UPDATE review_disputes SET latest_lifecycle_change_id = ${lifecycleId} WHERE id = ${disputeId}
    `)
  await recordModerationTrainingFeedback(
    {
      sourceType: 'review_dispute',
      eventType: 'dispute_resolved',
      label: 'edited',
      humanAction: 'resolve_annotate',
      actorUserId: staffUserId,
      communityId: row.community_id,
      postId: row.post_id,
      reviewDisputeId: disputeId,
      note: trimmedBody,
      metadata: { reason: row.reason, recommended_action: row.recommended_action },
    },
    { query },
  )
  const updated = row
  await query.commit()
  await logDisputeResolution(staffUserId, 'resolve_report', disputeId, updated.post_id)
  if (updated.post_author_id) {
    import('@services/notifications/create-review-actioned-notification')
      .then(({ createReviewActionedNotification }) =>
        createReviewActionedNotification(updated.post_author_id!, disputeId, 'annotate'),
      )
      .catch(onError)
  }
  return getReviewDisputeAfterMutation(disputeId)
}
