import { beginTransaction, read } from '@data-stores/psql'
import onError from '@modules/on-error'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { invalidate } from '@services/entity-cache/invalidate'
import { recordModerationTrainingFeedback } from '@services/moderation-training'
import { recordModeratorAction } from '@services/moderator-actions'
import { setPostClearanceStatus, type ClearanceDecisionContext } from './set-status.mts'
import { CLEARANCE_MODLOG_ACTIONS } from './status-constants.mts'
import { getClearanceTrainingLabel } from './training-label.mts'
import type { ClearanceStatus } from './types.mts'

export { approvePendingPostClearance } from './approve-pending.mts'
export {
  restorePostClearanceStatus,
  setPostClearanceStatus,
  type ClearanceDecisionContext,
} from './set-status.mts'

export async function updateClearanceStatus(
  postId: string,
  status: ClearanceStatus,
  updatedById?: string,
  decision: ClearanceDecisionContext = {},
): Promise<void> {
  let change: Awaited<ReturnType<typeof setPostClearanceStatus>> | null = null
  await using transaction = await beginTransaction()
  const { rows: beforeRows } = await transaction<{
    rejected_at: Date | null
    in_review_at: Date | null
    automated_moderation_signal: boolean
  }>(
    `/* updateClearanceStatus:previousState */
      SELECT rejected_at, in_review_at,
        EXISTS (
          SELECT 1
          FROM post_moderation_versions pmv
          JOIN post_moderation_dispositions pmd ON pmd.version_id = pmv.id
          WHERE pmv.post_id = posts.id
            AND pmv.content_sha256 = posts.llm_moderation_content_sha256
            AND pmd.disposition IN ('review', 'reject')
        ) OR EXISTS (
          SELECT 1
          FROM agent_moderations am
          WHERE am.post_id = posts.id
            AND am.flagged IS TRUE
            AND am.deleted_at IS NULL
        ) AS automated_moderation_signal
      FROM posts
      WHERE id = $1
      LIMIT 1`,
    [postId],
  )
  const previousState = beforeRows[0]
  change = await setPostClearanceStatus(
    postId,
    status,
    updatedById,
    { query: transaction },
    {},
    decision,
  )
  if (updatedById && change) {
    await recordModerationTrainingFeedback(
      {
        sourceType: 'community_review',
        eventType: 'manual_action_inferred',
        label: getClearanceTrainingLabel(status, previousState),
        labelConfidence: 0.7,
        humanAction: `clearance_${status}`,
        actorUserId: updatedById,
        communityId: change.community_id,
        postId,
        postClearanceChangeId: change.id,
        metadata: { clearance_status: status },
      },
      { query: transaction },
    )
  }
  await transaction.commit()
  if (change) void enqueueRefreshTopHashtags()
  await invalidate.posts(postId)
  const actionType = CLEARANCE_MODLOG_ACTIONS[status]
  if (actionType && updatedById) {
    const { rows } = await read<{ community_id: string | null; created_by_id: string | null }>(
      `/* updateClearanceStatus:postMeta */ SELECT community_id, created_by_id FROM posts WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [postId],
    )
    const communityId = rows[0]?.community_id ?? null
    const authorUserId = rows[0]?.created_by_id ?? null
    await recordModeratorAction(updatedById, { actionType, postId, communityId })
    if (status === 'rejected' && authorUserId) {
      import('@services/notifications/create-post-removed-notification')
        .then(module => module.createPostRemovedNotification(authorUserId, postId))
        .catch(onError)
    }
  }
}
