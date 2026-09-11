import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { setPostClearanceStatus } from '@services/post-clearance'
import { recordModerationTrainingFeedback } from '@services/moderation-training'
import type { ModerationAppeal } from './config.mts'
import { appendAppealLifecycleChange } from './lifecycle.mts'
import { logAppealResolution } from './resolution-modlog.mts'
import { revokeUserWarning } from '@services/user-warnings'
import { APPEAL_RETURNING } from './resolve-shared.mts'
import { maybeResolveCase } from '@services/moderation-cases'
import { invalidate } from '@services/entity-cache/invalidate'
import { getModerationAppealAfterMutation } from './get.mts'
import { assertModerationAppealDelivered } from './assert-delivered.mts'
import type { ModerationAppealResponse } from './types.mts'
import {
  liftCommunityBanById,
  liftUserSuspensionById,
  lockSuspensionAppealAuthorLifecycle,
} from './lift-sanctions.mts'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { lockPostPublication, recordPostPublicationChange } from '@services/post-publication'

export { dismissModerationAppeal } from './dismiss-appeal.mts'

export async function resolveModerationAppealAccept(
  staffUserId: string,
  appealId: string,
): Promise<ModerationAppealResponse> {
  await assertModerationAppealDelivered(appealId)
  const now = new Date()
  await using query = await beginTransaction()
  await lockSuspensionAppealAuthorLifecycle(query, appealId)
  const { rows } = await query(
    sql`/* resolveModerationAppealAccept */
      UPDATE moderation_appeals
      SET resolution_action = 'accept',
          resolved_at = ${now},
          resolved_by_id = ${staffUserId},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${appealId} AND sent_at IS NOT NULL AND resolved_at IS NULL
      RETURNING `.append(APPEAL_RETURNING),
  )
  const row = rows[0] as ModerationAppeal | undefined
  assert(row, 404, 'Appeal not found or already resolved')

  // Undo the original action based on which FK is set
  if (row.user_warning_id) {
    await revokeUserWarning(staffUserId, row.user_warning_id, { query })
  } else if (row.community_ban_id) {
    await liftCommunityBanById(staffUserId, row.community_ban_id, { query })
  } else if (row.user_suspension_id) {
    const { rows: adminRows } = await query(sql`/* resolveModerationAppealAccept:checkAdmin */
        SELECT ur.user_id
        FROM user_roles ur
        JOIN user_roles_types urt ON urt.id = ur.role_type_id
        WHERE ur.user_id = ${staffUserId} AND urt.slug = 'administrator'
        LIMIT 1
      `)
    assert(adminRows.length > 0, 403, 'Only administrators may accept suspension appeals')
    await liftUserSuspensionById(staffUserId, row.user_suspension_id, { query })
  } else if (row.post_id) {
    if (row.post_removal_kind === 'community') {
      await lockPostPublication(query, row.post_id)
      const { rows: reinstatedReviews } = await query<{ community_id: string }>(
        sql`/* resolveModerationAppealAccept:clearCommunityUnpublish */
  UPDATE community_post_reviews
  SET unpublished_at = NULL, unpublished_by_id = NULL
  WHERE post_id = ${row.post_id} AND unpublished_at IS NOT NULL
  RETURNING community_id`,
      )
      const reinstatedReview = reinstatedReviews[0]
      if (reinstatedReview) {
        await recordPostPublicationChange(query, {
          scope: { type: 'post', postId: row.post_id },
          reason: 'community_publication_changed',
          impactedCommunityIds: [reinstatedReview.community_id],
          footprint: { priorCommunityId: reinstatedReview.community_id },
        })
      }
    } else {
      await setPostClearanceStatus(row.post_id, 'approved', staffUserId, { query })
    }
  }

  const lifecycleId = await appendAppealLifecycleChange(
    appealId,
    'resolve_accept',
    staffUserId,
    { resolved_at: row.resolved_at, resolution_action: 'accept' },
    { query },
  )
  await Promise.all([
    query(sql`/* resolveModerationAppealAccept:setLifecycle */
        UPDATE moderation_appeals SET latest_lifecycle_change_id = ${lifecycleId} WHERE id = ${appealId}
      `),
    recordModerationTrainingFeedback(
      {
        sourceType: 'moderation_appeal',
        eventType: 'appeal_resolved',
        label: 'accepted',
        humanAction: 'resolve_accept',
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
  const postCommitWork: Promise<unknown>[] = [
    logAppealResolution(
      staffUserId,
      'resolve_appeal',
      appealId,
      updated.appellant_id,
      updated.community_id,
    ),
    maybeResolveCase(updated.case_id, staffUserId),
  ]
  if (updated.user_suspension_id) {
    postCommitWork.push(invalidate.users(updated.appellant_id))
  }
  if (updated.user_suspension_id || updated.post_id) {
    void enqueueRefreshTopHashtags()
  }
  await Promise.all(postCommitWork)
  return getModerationAppealAfterMutation(appealId)
}

export async function resolveModerationAppealReduce(
  staffUserId: string,
  appealId: string,
): Promise<ModerationAppealResponse> {
  await assertModerationAppealDelivered(appealId)
  const now = new Date()
  await using query = await beginTransaction()
  const { rows } = await query(
    sql`/* resolveModerationAppealReduce */
      UPDATE moderation_appeals
      SET resolution_action = 'reduce',
          resolved_at = ${now},
          resolved_by_id = ${staffUserId},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${appealId} AND sent_at IS NOT NULL AND resolved_at IS NULL
      RETURNING `.append(APPEAL_RETURNING),
  )
  const row = rows[0] as ModerationAppeal | undefined
  assert(row, 404, 'Appeal not found or already resolved')

  const lifecycleId = await appendAppealLifecycleChange(
    appealId,
    'resolve_reduce',
    staffUserId,
    { resolved_at: row.resolved_at, resolution_action: 'reduce' },
    { query },
  )
  await Promise.all([
    query(sql`/* resolveModerationAppealReduce:setLifecycle */
        UPDATE moderation_appeals SET latest_lifecycle_change_id = ${lifecycleId} WHERE id = ${appealId}
      `),
    recordModerationTrainingFeedback(
      {
        sourceType: 'moderation_appeal',
        eventType: 'appeal_resolved',
        label: 'edited',
        humanAction: 'resolve_reduce',
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
      'resolve_appeal',
      appealId,
      updated.appellant_id,
      updated.community_id,
    ),
    maybeResolveCase(updated.case_id, staffUserId),
  ])
  return getModerationAppealAfterMutation(appealId)
}
