import { read, beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
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
 * Used by the AI report-judgement agent.
 */
export async function unpublishPostAsAgent(
  communityId: string,
  postId: string,
): Promise<AgentRemovalResult> {
  const publication = await getReview(communityId, postId)
  if (!publication) return 'not-applicable'
  if (publication.platform_override_at) return 'not-applicable'
  if (!publication.approved_at || publication.rejected_at) return 'not-applicable'
  if (publication.unpublished_at) return 'already-removed'

  const moderationSystemUserId = await getModerationSystemUserId()
  await using query = await beginTransaction()
  const result = await unpublishInTransaction(query, {
    communityId,
    postId,
    moderationSystemUserId,
  })
  await query.commit()
  return result
}

/**
 * The community moderation classifier's unpublish, run inside the caller's transaction (the
 * classifier run's completion transaction), which owns the commit and every post-commit effect.
 * It also records the flag on the review row, for the digest the classifier ran on, so the
 * unpublish stays attributable to automod. A post under platform override is never touched.
 */
export async function unpublishPostForAutomodFlag(
  query: TransactionQuery,
  input: {
    communityId: string
    postId: string
    contentSha256: Buffer
    moderationSystemUserId: string
  },
): Promise<Exclude<AgentRemovalResult, 'not-applicable'>> {
  const flagAssignments = automodFlagAssignments(input.contentSha256)
  return unpublishInTransaction(query, input, flagAssignments)
}

async function unpublishInTransaction(
  query: TransactionQuery,
  input: { communityId: string; postId: string; moderationSystemUserId: string },
  flagAssignments: SQLStatement = sql``,
): Promise<Exclude<AgentRemovalResult, 'not-applicable'>> {
  const { communityId, postId, moderationSystemUserId } = input
  await lockPostPublication(query, postId)
  const { rowCount } = await write(
    sql`/* unpublishPostAsAgent */
      UPDATE community_post_reviews
      SET unpublished_at = CURRENT_TIMESTAMP,
          unpublished_by_id = ${moderationSystemUserId}`
      .append(flagAssignments)
      .append(
        sql`
      WHERE community_id = ${communityId}
        AND post_id = ${postId}
        AND approved_at IS NOT NULL
        AND rejected_at IS NULL
        AND unpublished_at IS NULL
        AND platform_override_at IS NULL
      `,
      ),
    { query },
  )
  if ((rowCount ?? 0) === 0) return 'already-removed'
  // ast-grep-ignore: no-three-sequential-awaits -- review history, publication capture, and moderator audit must commit in causal order
  await write(
    sql`/* recordAgentPublicationReviewChange */
      INSERT INTO community_post_review_changes (
        community_id, post_id, actor_user_id, action, platform_override
      ) VALUES (
        ${communityId}, ${postId}, ${moderationSystemUserId}, 'unpublish', false
      )`,
    { query },
  )
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
  return 'removed'
}

/** The flag shares the statement's timestamp with `unpublished_at`; a new flag clears any dismissal. */
function automodFlagAssignments(contentSha256: Buffer): SQLStatement {
  return sql`,
          automod_action = 'unpublish',
          automod_flagged_at = CURRENT_TIMESTAMP,
          automod_flagged_content_sha256 = ${contentSha256},
          automod_dismissed_at = NULL,
          automod_dismissed_by_id = NULL`
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
