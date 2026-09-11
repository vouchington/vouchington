import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { recordModerationTrainingFeedback } from '@services/moderation-training'
import type { ModerationAppeal } from './config.mts'
import { appendAppealLifecycleChange } from './lifecycle.mts'
import { logAppealResolution } from './resolution-modlog.mts'
import { APPEAL_RETURNING } from './resolve-shared.mts'
import { maybeResolveCase } from '@services/moderation-cases'
import { getModerationAppealAfterMutation } from './get.mts'
import { assertModerationAppealDelivered } from './assert-delivered.mts'

export async function dismissModerationAppeal(
  staffUserId: string,
  appealId: string,
): Promise<ModerationAppeal> {
  await assertModerationAppealDelivered(appealId)
  const now = new Date()
  await using query = await beginTransaction()
  const { rows } = await query(
    sql`/* dismissModerationAppeal */
      UPDATE moderation_appeals
      SET resolved_at = ${now},
          resolved_by_id = ${staffUserId},
          resolution_action = 'deny',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${appealId} AND sent_at IS NOT NULL AND resolved_at IS NULL
      RETURNING `.append(APPEAL_RETURNING),
  )
  const row = rows[0] as ModerationAppeal | undefined
  assert(row, 404, 'Appeal not found or already resolved')

  const lifecycleId = await appendAppealLifecycleChange(
    appealId,
    'dismiss',
    staffUserId,
    { resolved_at: row.resolved_at, resolution_action: 'deny' },
    { query },
  )
  await Promise.all([
    query(sql`/* dismissModerationAppeal:setLifecycle */
        UPDATE moderation_appeals SET latest_lifecycle_change_id = ${lifecycleId} WHERE id = ${appealId}
      `),
    recordModerationTrainingFeedback(
      {
        sourceType: 'moderation_appeal',
        eventType: 'appeal_resolved',
        label: 'rejected',
        humanAction: 'dismiss',
        actorUserId: staffUserId,
        communityId: row.community_id,
        postId: row.post_id,
        moderationAppealId: appealId,
        metadata: { recommended_action: row.recommended_action },
      },
      { query },
    ),
  ])
  const updated = row
  await query.commit()
  await Promise.all([
    logAppealResolution(
      staffUserId,
      'dismiss_appeal',
      appealId,
      updated.appellant_id,
      updated.community_id,
    ),
    maybeResolveCase(updated.case_id, staffUserId),
  ])
  return getModerationAppealAfterMutation(appealId)
}
