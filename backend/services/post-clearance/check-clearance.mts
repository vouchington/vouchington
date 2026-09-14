import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { enqueueModerationDispatcher } from '@queues/ai-agents/enqueues/moderation'
import { invalidate } from '@services/entity-cache/invalidate'
import { recordModeratorAction } from '@services/moderator-actions'
import { lockPostPublication, recordPostPublicationChange } from '@services/post-publication'
import { getModerationSystemUserId } from '@services/users/system-users'
import { POST_MODERATION_POLICY_REVISION } from './moderation-ledger-types.mts'

/** Projects the current moderation version into the coarse post lifecycle. */
export async function checkPostClearance(postId: string): Promise<void> {
  const moderationSystemUserId = await getModerationSystemUserId()
  await using transaction = await beginTransaction()
  const updatedRows = await applyClearanceDecision(transaction, postId, moderationSystemUserId)
  await transaction.commit()

  const row = updatedRows[0]
  if (row) await invalidate.posts(postId)
  if (row?.clearance_status === 'approved') void enqueueModerationDispatcher(postId)
}

async function applyClearanceDecision(
  query: TransactionQuery,
  postId: string,
  moderationSystemUserId: string,
) {
  await lockPostPublication(query, postId)
  const { rows: updatedRows } = await query<{
    clearance_status: 'approved' | 'rejected' | 'in_review'
    community_id: string | null
  }>(
    `/* checkPostClearance */
      WITH current_version AS (
        SELECT version.id AS version_id, post.id AS post_id,
          latest_change.platform_override
        FROM posts post
        JOIN post_moderation_versions version
          ON version.post_id = post.id
         AND version.content_sha256 = post.llm_moderation_content_sha256
         AND version.policy_revision = $3
        LEFT JOIN post_clearance_changes latest_change
          ON latest_change.id = post.latest_clearance_change_id
        WHERE post.id = $1
          AND post.deleted_at IS NULL
        FOR UPDATE OF post
      ),
      latest_dispositions AS (
        SELECT DISTINCT ON (disposition.source)
          disposition.source, disposition.disposition, disposition.reason_code
        FROM post_moderation_dispositions disposition
        JOIN current_version ON current_version.version_id = disposition.version_id
        WHERE disposition.source IN ('openai_omni', 'spam_detection')
        ORDER BY disposition.source, disposition.id DESC
      ),
      decision AS (
        SELECT current_version.post_id,
          CASE
            WHEN bool_or(latest_dispositions.source = 'openai_omni'
              AND latest_dispositions.disposition = 'reject'
              AND latest_dispositions.reason_code = 'sexual_minors')
              THEN 'reject'::post_clearance_change_types
            WHEN bool_or(latest_dispositions.disposition IN ('review', 'reject', 'incomplete'))
              THEN 'mark_in_review'::post_clearance_change_types
            WHEN bool_and(latest_dispositions.disposition = 'pass')
              THEN 'approve'::post_clearance_change_types
          END AS change_type,
          CASE
            WHEN bool_or(latest_dispositions.source = 'openai_omni'
              AND latest_dispositions.disposition = 'reject'
              AND latest_dispositions.reason_code = 'sexual_minors')
              THEN 'deterministic_policy_block'
            WHEN bool_or(latest_dispositions.disposition = 'incomplete') THEN 'automation_unavailable'
            WHEN bool_or(latest_dispositions.disposition = 'review') THEN 'moderation_review_required'
            ELSE NULL
          END AS public_reason_code,
          array_agg(latest_dispositions.source::text ORDER BY latest_dispositions.source)
            FILTER (WHERE latest_dispositions.disposition IN ('review', 'reject')) AS signal_sources
        FROM current_version
        JOIN latest_dispositions ON true
        WHERE current_version.platform_override IS NOT TRUE
        GROUP BY current_version.post_id
        HAVING count(*) = 2
      ),
      changed_decision AS (
        SELECT decision.*
        FROM decision
        JOIN posts post ON post.id = decision.post_id
        WHERE (decision.change_type = 'approve' AND post.approved_at IS NULL
          AND post.rejected_at IS NULL AND post.in_review_at IS NULL)
          OR (decision.change_type = 'reject' AND post.rejected_at IS NULL
            AND post.in_review_at IS NULL)
          OR (decision.change_type = 'mark_in_review' AND post.in_review_at IS NULL
            AND post.rejected_at IS NULL)
      ),
      inserted_change AS (
        INSERT INTO post_clearance_changes (
          post_id, change_type, changed_by_id, public_reason_code, metadata,
          moderation_transparency_categories
        )
        SELECT post_id, change_type, $2, public_reason_code,
          jsonb_build_object('moderation_version_policy_revision', $3),
          CASE WHEN change_type = 'reject'
            THEN COALESCE(signal_sources, '{}'::text[]) ELSE '{}'::text[] END
        FROM changed_decision
        RETURNING id, post_id, change_type, created_at
      )
      UPDATE posts
      SET latest_clearance_change_id = inserted_change.id,
        approved_at = CASE WHEN inserted_change.change_type = 'approve'
          THEN inserted_change.created_at ELSE NULL END,
        rejected_at = CASE WHEN inserted_change.change_type = 'reject'
          THEN inserted_change.created_at ELSE NULL END,
        in_review_at = CASE WHEN inserted_change.change_type = 'mark_in_review'
          THEN inserted_change.created_at ELSE NULL END
      FROM inserted_change
      WHERE posts.id = inserted_change.post_id
      RETURNING posts.community_id,
        CASE
          WHEN inserted_change.change_type = 'approve' THEN 'approved'
          WHEN inserted_change.change_type = 'reject' THEN 'rejected'
          ELSE 'in_review'
        END AS clearance_status`,
    [postId, moderationSystemUserId, POST_MODERATION_POLICY_REVISION],
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
