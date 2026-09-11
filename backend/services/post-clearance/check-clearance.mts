import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { enqueueModerationDispatcher } from '@queues/ai-agents/enqueues/moderation'
import { invalidate } from '@services/entity-cache/invalidate'
import { recordModeratorAction } from '@services/moderator-actions'
import { getModerationSystemUserId } from '@services/users/system-users'
import { lockPostPublication, recordPostPublicationChange } from '@services/post-publication'

/**
 * Atomically checks if all clearance conditions are met and transitions the post
 * clearance status.
 *
 * Records one clearance transition when moderation inputs are complete.
 *
 * On approval, enqueues LLM agent moderation (fire-and-forget).
 * Approved posts can still be demoted to rejected when a later moderation pass flags them.
 */
export async function checkPostClearance(postId: string): Promise<void> {
  const moderationSystemUserId = await getModerationSystemUserId()
  async function checkClearanceInTransaction() {
    await using query = await beginTransaction()
    async function applyClearanceDecision(query: TransactionQuery) {
      await lockPostPublication(query, postId)
      const { rows: updatedRows } = await query<{
        clearance_status: string
        community_id: string | null
      }>(
        `/* checkPostClearance */
      WITH clearance_decision AS (
        SELECT
          id AS post_id,
          CASE
            WHEN (
              openai_omni_moderation_flagged IS TRUE
              OR spam_detection_flagged IS TRUE
            )
            AND rejected_at IS NULL
            AND in_review_at IS NULL
            THEN 'reject'::post_clearance_change_types
            WHEN openai_omni_moderation_flagged IS NOT TRUE
              AND spam_detection_flagged IS NOT TRUE
              AND approved_at IS NULL
              AND rejected_at IS NULL
              AND in_review_at IS NULL
            THEN 'approve'::post_clearance_change_types
          END AS change_type,
          openai_omni_moderation_flagged,
          spam_detection_flagged
        FROM posts
        WHERE id = $1
          AND openai_omni_moderation_created_at IS NOT NULL
          AND spam_detection_created_at IS NOT NULL
        FOR UPDATE
      ),
      inserted_change AS (
        INSERT INTO post_clearance_changes (post_id, change_type, changed_by_id, metadata, moderation_transparency_categories)
        SELECT
          post_id,
          change_type,
          $2,
          '{}'::jsonb,
          CASE WHEN change_type = 'reject' THEN array_remove(ARRAY[
            CASE WHEN openai_omni_moderation_flagged IS TRUE THEN 'openai_omni' END,
            CASE WHEN spam_detection_flagged IS TRUE THEN 'spam_detection' END
          ], NULL) ELSE '{}'::text[] END
        FROM clearance_decision
        WHERE change_type IS NOT NULL
        RETURNING id, post_id, change_type, created_at
      )
      UPDATE posts
      SET
        latest_clearance_change_id = inserted_change.id,
        approved_at = CASE WHEN inserted_change.change_type = 'approve' THEN inserted_change.created_at ELSE NULL END,
        rejected_at = CASE WHEN inserted_change.change_type = 'reject' THEN inserted_change.created_at ELSE NULL END,
        in_review_at = NULL
      FROM inserted_change
      WHERE posts.id = inserted_change.post_id
      RETURNING posts.community_id,
        CASE
          WHEN inserted_change.change_type = 'approve' THEN 'approved'
          WHEN inserted_change.change_type = 'reject' THEN 'rejected'
        END AS clearance_status`,
        [postId, moderationSystemUserId],
      )
      const updated = updatedRows[0]
      if (updated?.clearance_status === 'rejected') {
        await recordModeratorAction(
          moderationSystemUserId,
          { actionType: 'reject', postId, communityId: updated.community_id },
          { query },
        )
      }
      if (updated) {
        await recordPostPublicationChange(query, {
          scope: { type: 'post', postId },
          reason: 'post_clearance_changed',
          footprint: { priorCommunityId: updated.community_id ?? undefined },
        })
      }
      return updatedRows
    }
    const result = await applyClearanceDecision(query)
    await query.commit()
    return result
  }
  const rows = await checkClearanceInTransaction()

  const row = rows[0]
  if (row) await invalidate.posts(postId)
  if (row?.clearance_status === 'approved') void enqueueModerationDispatcher(postId)
}
