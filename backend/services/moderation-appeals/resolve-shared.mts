import assert from 'http-assert'
import sql from 'sql-template-strings'
import { beginTransaction } from '@data-stores/psql'
import { maybeResolveCase } from '@services/moderation-cases'
import {
  recordModerationTrainingFeedback,
  type ModerationTrainingEvidence,
} from '@services/moderation-training'
import { assertModerationAppealDelivered } from './assert-delivered.mts'
import type { ModerationAppeal } from './config.mts'
import { getModerationAppealAfterMutation } from './get.mts'
import { appendAppealLifecycleChange } from './lifecycle.mts'
import { logAppealResolution } from './resolution-modlog.mts'
import type { ModerationAppealResponse } from './types.mts'

export const APPEAL_RETURNING = sql`
  id, case_id, appellant_id, user_warning_id, community_ban_id, post_id, user_suspension_id, community_id, post_removal_kind,
  appeal_reason,
  CASE
    WHEN resolved_at IS NULL THEN 'pending'
    WHEN resolution_action = 'deny' THEN 'dismissed'
    ELSE 'resolved'
  END AS status,
  recommended_action, ai_public_response, ai_internal_response,
  model, ai_drafted_at, public_response, internal_notes, drafted_at, edited_at, edited_by_id,
  approved_at, approved_by_id, sent_at, resolved_at, resolved_by_id,
  resolution_action, latest_lifecycle_change_id, updated_at,
  uuid_extract_timestamp(id) AS created_at
`

export const DISMISS_DELIVERED_APPEAL_RESOLUTION = {
  resolutionAction: 'deny',
  lifecycle: 'dismiss',
  trainingLabel: 'rejected',
  humanAction: 'dismiss',
  modlogAction: 'dismiss_appeal',
} as const

export const REDUCE_DELIVERED_APPEAL_RESOLUTION = {
  resolutionAction: 'reduce',
  lifecycle: 'resolve_reduce',
  trainingLabel: 'edited',
  humanAction: 'resolve_reduce',
  modlogAction: 'resolve_appeal',
} as const

type DeliveredAppealResolution =
  | typeof DISMISS_DELIVERED_APPEAL_RESOLUTION
  | typeof REDUCE_DELIVERED_APPEAL_RESOLUTION

export async function finalizeDeliveredModerationAppeal(
  staffUserId: string,
  appealId: string,
  resolution: DeliveredAppealResolution,
  trainingEvidence: ModerationTrainingEvidence,
): Promise<ModerationAppealResponse> {
  await assertModerationAppealDelivered(appealId)
  const now = new Date()
  await using query = await beginTransaction()
  const { rows } = await query(
    sql`/* finalizeDeliveredModerationAppeal */
      UPDATE moderation_appeals
      SET resolved_at = ${now},
          resolved_by_id = ${staffUserId},
          resolution_action = ${resolution.resolutionAction},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${appealId} AND sent_at IS NOT NULL AND resolved_at IS NULL
      RETURNING `.append(APPEAL_RETURNING),
  )
  const row = rows[0] as ModerationAppeal | undefined
  assert(row, 404, 'Appeal not found or already resolved')

  const lifecycleId = await appendAppealLifecycleChange(
    appealId,
    resolution.lifecycle,
    staffUserId,
    {},
    { query },
  )
  await Promise.all([
    query(sql`/* finalizeDeliveredModerationAppeal:setLifecycle */
        UPDATE moderation_appeals SET latest_lifecycle_change_id = ${lifecycleId} WHERE id = ${appealId}
      `),
    recordModerationTrainingFeedback(
      {
        trainingEvidence,
        sourceType: 'moderation_appeal',
        eventType: 'appeal_resolved',
        label: resolution.trainingLabel,
        humanAction: resolution.humanAction,
        actorUserId: staffUserId,
        communityId: row.community_id,
        postId: row.post_id,
        moderationAppealId: appealId,
        metadata: { recommended_action: row.recommended_action },
      },
      { query },
    ),
  ])
  await logAppealResolution(
    staffUserId,
    resolution.modlogAction,
    appealId,
    row.appellant_id,
    row.community_id,
    { query },
  )
  await query.commit()
  await maybeResolveCase(row.case_id, staffUserId)
  return await getModerationAppealAfterMutation(appealId)
}
