import type { ClearanceStatus } from './types.mts'
import { beginTransaction, read, type QueryOptions, type TransactionQuery } from '@data-stores/psql'
import { invalidate } from '@services/entity-cache/invalidate'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { recordModeratorAction } from '@services/moderator-actions'
import { recordModerationTrainingFeedback } from '@services/moderation-training'
import { MODERATION_SYSTEM_USERNAME } from '@services/users/constants'
import onError from '@modules/on-error'
import { recordPostClearancePublicationChange } from './publication-change.mts'
import { getClearanceTrainingLabel } from './training-label.mts'
import { lockPostPublication } from '@services/post-publication'
import { CLEARANCE_CHANGE_TYPES, CLEARANCE_MODLOG_ACTIONS } from './status-constants.mts'
import { runPostClearanceTransaction } from './status-transaction.mts'
export async function updateClearanceStatus(
  postId: string,
  status: ClearanceStatus,
  updatedById?: string,
): Promise<void> {
  let change: Awaited<ReturnType<typeof setPostClearanceStatus>> | null = null
  await using transaction = await beginTransaction()
  const { rows: beforeRows } = await transaction<{
    rejected_at: Date | null
    in_review_at: Date | null
    openai_omni_moderation_flagged: boolean | null
    spam_detection_flagged: boolean | null
    agent_moderation_flagged: boolean
  }>(
    `/* updateClearanceStatus:previousState */
      SELECT
        rejected_at,
        in_review_at,
        openai_omni_moderation_flagged,
        spam_detection_flagged,
        EXISTS (
          SELECT 1
          FROM agent_moderations am
          WHERE am.post_id = posts.id
            AND am.flagged IS TRUE
            AND am.deleted_at IS NULL
        ) AS agent_moderation_flagged
      FROM posts
      WHERE id = $1
      LIMIT 1`,
    [postId],
  )
  const previousState = beforeRows[0]
  change = await setPostClearanceStatus(postId, status, updatedById, { query: transaction })
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
        .then(m => m.createPostRemovedNotification(authorUserId, postId))
        .catch(onError)
    }
  }
}
export async function setPostClearanceStatus(
  postId: string,
  status: ClearanceStatus,
  updatedById?: string | null,
  options?: QueryOptions,
  metadata: Record<string, unknown> = {},
): Promise<{ id: string; community_id: string | null } | null> {
  const changeType = CLEARANCE_CHANGE_TYPES[status]

  const transactionOptions = options ?? {}
  const run = async (query: TransactionQuery) => {
    await lockPostPublication(query, postId)
    const { rows } = await query<{ id: string; community_id: string | null }>(
      `/* setPostClearanceStatus */
    WITH inserted_change AS (
        INSERT INTO post_clearance_changes (post_id, change_type, changed_by_id, metadata, moderation_transparency_categories)
      SELECT
        p.id,
        $2::post_clearance_change_types,
        $3,
        $5::jsonb,
        CASE WHEN $2::post_clearance_change_types = 'reject' AND actor.username = $4
          THEN ARRAY['post_clearance_reject']::text[] ELSE '{}'::text[] END
      FROM posts p
      LEFT JOIN users actor ON actor.id = $3
      WHERE p.id = $1
      RETURNING id, post_id, change_type, created_at
    )
    UPDATE posts
    SET
      latest_clearance_change_id = inserted_change.id,
      approved_at = CASE WHEN inserted_change.change_type = 'approve' THEN inserted_change.created_at ELSE NULL END,
      rejected_at = CASE WHEN inserted_change.change_type = 'reject' THEN inserted_change.created_at ELSE NULL END,
      in_review_at = CASE WHEN inserted_change.change_type = 'mark_in_review' THEN inserted_change.created_at ELSE NULL END,
      updated_by_id = COALESCE($3, updated_by_id)
    FROM inserted_change
    WHERE posts.id = inserted_change.post_id
    RETURNING inserted_change.id, posts.community_id`,
      [
        postId,
        changeType,
        updatedById ?? null,
        MODERATION_SYSTEM_USERNAME,
        JSON.stringify(metadata),
      ],
    )
    const change = rows[0] ?? null
    if (change) {
      await recordPostClearancePublicationChange(query, postId, change.community_id)
    }
    return change
  }
  const change = await runPostClearanceTransaction(transactionOptions, run)
  if (change && !transactionOptions.query && !transactionOptions.client)
    void enqueueRefreshTopHashtags()
  return change
}

export async function approvePendingPostClearance(
  postId: string,
  updatedById?: string | null,
  options?: QueryOptions,
): Promise<boolean> {
  const transactionOptions = options ?? {}
  const run = async (query: TransactionQuery) => {
    await lockPostPublication(query, postId)
    const { rowCount } = await query(
      `/* approvePendingPostClearance */
    WITH pending_post AS (
      SELECT id AS post_id
      FROM posts
      WHERE id = $1
        AND approved_at IS NULL
        AND rejected_at IS NULL
        AND in_review_at IS NULL
      FOR UPDATE
    ),
    inserted_change AS (
      INSERT INTO post_clearance_changes (post_id, change_type, changed_by_id)
      SELECT post_id, 'approve'::post_clearance_change_types, $2
      FROM pending_post
      RETURNING id, post_id, created_at
    )
    UPDATE posts
    SET
      latest_clearance_change_id = inserted_change.id,
      approved_at = inserted_change.created_at,
      rejected_at = NULL,
      in_review_at = NULL,
      updated_by_id = COALESCE($2, updated_by_id)
    FROM inserted_change
    WHERE posts.id = inserted_change.post_id`,
      [postId, updatedById ?? null],
    )
    const changed = (rowCount ?? 0) > 0
    if (changed) {
      await recordPostClearancePublicationChange(query, postId)
    }
    return changed
  }
  const changed = await runPostClearanceTransaction(transactionOptions, run)
  if (changed && !transactionOptions.query && !transactionOptions.client) {
    void enqueueRefreshTopHashtags()
    await invalidate.posts(postId)
  }
  return changed
}
