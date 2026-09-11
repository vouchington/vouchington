import { read, beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { recordModeratorAction } from '@services/moderator-actions'
import { getModerationSystemUserId } from '@services/users/system-users'
import type { CommunityPostReview } from '../types.mts'
import { lockPostPublication, recordPostPublicationChange } from '@services/post-publication'

/**
 * Three-state result for agent-driven content removal:
 * - 'removed'        — content was just removed by this call
 * - 'already-removed'— content was already removed before this call (idempotent retry safe)
 * - 'not-applicable' — no removal action taken (no review row, never approved, etc.)
 */
export type AgentRemovalResult = 'removed' | 'already-removed' | 'not-applicable'

/**
 * Agent-driven unpublish: bypasses human moderator access check.
 * Used by community moderation agents when on_flag_action='unpublish'.
 */
export async function unpublishPostAsAgent(
  communityId: string,
  postId: string,
): Promise<AgentRemovalResult> {
  const publication = await getReview(communityId, postId)
  if (!publication) return 'not-applicable'
  if (!publication.approved_at || publication.rejected_at) return 'not-applicable'
  if (publication.unpublished_at) return 'already-removed'

  const moderationSystemUserId = await getModerationSystemUserId()
  await using query = await beginTransaction()

  await lockPostPublication(query, postId)
  const { rowCount } = await write(
    sql`/* unpublishPostAsAgent */
      UPDATE community_post_reviews
      SET unpublished_at = CURRENT_TIMESTAMP,
          unpublished_by_id = ${moderationSystemUserId}
      WHERE community_id = ${communityId}
        AND post_id = ${postId}
        AND approved_at IS NOT NULL
        AND rejected_at IS NULL
        AND unpublished_at IS NULL
      `,
    { query },
  )
  if ((rowCount ?? 0) === 0) {
    await query.commit()
    return 'already-removed'
  }
  await recordPostPublicationChange(query, {
    scope: { type: 'post', postId },
    reason: 'community_publication_changed',
    impactedCommunityIds: [communityId],
    footprint: { priorCommunityId: communityId },
  })
  await recordModeratorAction(
    moderationSystemUserId,
    { actionType: 'remove', communityId, postId },
    { query },
  )
  await query.commit()
  return 'removed'
}

async function getReview(communityId: string, postId: string): Promise<CommunityPostReview | null> {
  const { rows } = await read(
    sql`/* unpublishPostAsAgent:getReview */
    SELECT *
    FROM community_post_reviews
    WHERE community_id = ${communityId}
      AND post_id = ${postId}
    LIMIT 1
    `,
  )
  return (rows[0] as CommunityPostReview) ?? null
}
