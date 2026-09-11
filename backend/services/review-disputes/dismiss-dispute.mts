import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { recordModerationTrainingFeedback } from '@services/moderation-training'
import type { ReviewDisputeResponse } from './types.mts'
import { getReviewDisputeAfterMutation } from './get.mts'
import { appendLifecycleChange } from './lifecycle.mts'
import { logDisputeResolution } from './resolution-modlog.mts'
import { DISPUTE_RETURNING, type ReviewDisputeResolutionRow } from './resolve-shared.mts'

export async function dismissReviewDispute(
  staffUserId: string,
  disputeId: string,
): Promise<ReviewDisputeResponse> {
  const now = new Date()
  await using query = await beginTransaction()
  const { rows } = await query(
    sql`/* dismissReviewDispute */
      UPDATE review_disputes
      SET resolved_at = ${now},
          resolved_by_id = ${staffUserId},
          resolution_action = 'dismiss',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${disputeId} AND resolved_at IS NULL
      RETURNING `.append(DISPUTE_RETURNING),
  )
  const row = rows[0] as ReviewDisputeResolutionRow | undefined
  assert(row, 404, 'Dispute not found or already resolved')

  const lifecycleId = await appendLifecycleChange(
    disputeId,
    'dismiss',
    staffUserId,
    { resolved_at: row.resolved_at, resolution_action: 'dismiss' },
    { query },
  )
  await Promise.all([
    query(sql`/* dismissReviewDispute:setLifecycle */
        UPDATE review_disputes SET latest_lifecycle_change_id = ${lifecycleId} WHERE id = ${disputeId}
      `),
    recordModerationTrainingFeedback(
      {
        sourceType: 'review_dispute',
        eventType: 'dispute_resolved',
        label: 'rejected',
        humanAction: 'dismiss',
        actorUserId: staffUserId,
        communityId: row.community_id,
        postId: row.post_id,
        reviewDisputeId: disputeId,
        metadata: { reason: row.reason, recommended_action: row.recommended_action },
      },
      { query },
    ),
  ])
  const updated = row
  await query.commit()
  await logDisputeResolution(staffUserId, 'dismiss_report', disputeId, updated.post_id)
  return getReviewDisputeAfterMutation(disputeId)
}
