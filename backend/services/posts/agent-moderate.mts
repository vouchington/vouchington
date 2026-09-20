import { beginTransaction, read, write } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { getModerationSystemUserId } from '@services/users/system-users'
import { createPostRevision } from '@services/post-revisions'
import { recordModeratorAction } from '@services/moderator-actions'
import { enqueueOnPostDeleted } from '@queues/entity-listeners/enqueues'
import { lockPostPublication, recordPostPublicationChange } from '@services/post-publication'
import { retirePostImagePlacements } from './image-placements.mts'
import { preparePostImageDeliveryMutation } from './media-delivery.mts'
import { compensateFailedImageDeliveryMutation } from '../images/delivery-registry.mts'
import onError from '@modules/on-error'

/**
 * Three-state result for agent-driven content removal:
 * - 'removed'        — content was just removed by this call
 * - 'already-removed'— content was already removed before this call (idempotent retry safe)
 * - 'not-applicable' — no removal action taken (wrong entity type, entity not found, etc.)
 */
export type AgentRemovalResult = 'removed' | 'already-removed' | 'not-applicable'

/**
 * Agent-driven comment removal: soft-deletes the comment via posts.deleted_at.
 * Bypasses human moderator access checks.
 * Works for both community and platform comments.
 *
 * IMPORTANT: does NOT call dismissPendingReportsForDeletedEntity — the caller
 * (dispatchRemove) is responsible for resolving the triggering report as 'actioned'.
 * Dismissing here would set the report to 'dismissed' and block the 'actioned' resolution.
 */
export async function removeCommentAsAgent(commentId: string): Promise<AgentRemovalResult> {
  const { rows } = await read<{
    post_type: string
    deleted_at: Date | null
    community_id: string | null
  }>(sql`/* removeCommentAsAgent:lookup */
    SELECT post_type, deleted_at, community_id
    FROM posts
    WHERE id = ${commentId}::uuid
    LIMIT 1
  `)
  const row = rows[0]
  if (!row || row.post_type !== 'comment') return 'not-applicable'
  if (row.deleted_at) return 'already-removed'

  const moderationSystemUserId = await getModerationSystemUserId()
  try {
    await using query = await beginTransaction()
    const result = await removeCommentInTransaction({
      commentId,
      communityId: row.community_id,
      moderationSystemUserId,
      query,
    })
    await query.commit()

    if (result === 'removed') void enqueueOnPostDeleted(commentId)
    return result
  } catch (error) {
    await compensateFailedImageDeliveryMutation({ postIds: [commentId] }).catch(onError)
    throw error
  }
}

async function removeCommentInTransaction(input: {
  commentId: string
  communityId: string | null
  moderationSystemUserId: string
  query: TransactionQuery
}): Promise<Exclude<AgentRemovalResult, 'not-applicable'>> {
  const { commentId, communityId, moderationSystemUserId, query } = input
  await preparePostImageDeliveryMutation(query, { postId: commentId, imageIds: [] })
  await lockPostPublication(query, commentId)
  const { rowCount } = await write(
    sql`/* removeCommentAsAgent */
      UPDATE posts
      SET deleted_at = CURRENT_TIMESTAMP,
          deleted_by_id = ${moderationSystemUserId}
      WHERE id = ${commentId}::uuid
        AND post_type = 'comment'
        AND deleted_at IS NULL`,
    { query },
  )
  if ((rowCount ?? 0) === 0) return 'already-removed'
  await retirePostImagePlacements(commentId, query)
  // ast-grep-ignore: no-three-sequential-awaits -- removal revision, publication capture, and moderator audit must commit in order
  await createPostRevision(
    commentId,
    'delete',
    { deleted_at: { before: null, after: 'now' } },
    moderationSystemUserId,
    { query },
  )
  await recordPostPublicationChange(query, {
    scope: { type: 'post', postId: commentId },
    reason: 'post_deleted',
    impactedPostIds: [commentId],
    footprint: { priorCommunityId: communityId ?? undefined },
  })
  await recordModeratorAction(
    moderationSystemUserId,
    { actionType: 'remove', communityId, postId: commentId },
    { query },
  )
  return 'removed'
}
