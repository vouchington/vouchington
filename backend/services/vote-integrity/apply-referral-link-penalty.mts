import { getModerationSystemUserId } from '@services/users/system-users'
import { insertVoteWeightPenalty } from './insert-vote-weight-penalty.mts'

/**
 * Penalize a user for embedding referral links in a post.
 *
 * Idempotent per post: ON CONFLICT prevents double-penalizing if the same
 * post is re-analyzed (retries, content updates that still contain referral links).
 *
 * Fire-and-forget: vote weight recalculation is enqueued asynchronously.
 */
export async function penalizeReferralLinkInPost(userId: string, postId: string): Promise<void> {
  const moderationSystemUserId = await getModerationSystemUserId()
  await insertVoteWeightPenalty({
    userIds: [userId],
    reason: 'referral_link_in_post',
    sourcePostId: postId,
    createdById: moderationSystemUserId,
  })
}
