import { beginTransaction, read, write } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { getModerationSystemUserId } from '@services/users/system-users'
import { createPostRevision } from '@services/post-revisions'
import { recordModeratorAction } from '@services/moderator-actions'
import { enqueueOnPostDeleted } from '@queues/entity-listeners/enqueues'
import { lockPostPublication, recordPostPublicationChange } from '@services/post-publication'

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
  await using query = await beginTransaction()
  async function removeCommentInTransaction(query: TransactionQuery) {
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
    if ((rowCount ?? 0) === 0) return 'already-removed' as const
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
      footprint: { priorCommunityId: row.community_id ?? undefined },
    })
    await recordModeratorAction(
      moderationSystemUserId,
      { actionType: 'remove', communityId: row.community_id, postId: commentId },
      { query },
    )
    return 'removed' as const
  }
  const result = await removeCommentInTransaction(query)
  await query.commit()

  if (result === 'removed') void enqueueOnPostDeleted(commentId)
  return result
}
