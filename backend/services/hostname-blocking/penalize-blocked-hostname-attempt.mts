import { getModerationSystemUserId } from '@services/users/system-users'
import { insertVoteWeightPenalty } from '@services/vote-integrity/insert-vote-weight-penalty'

/**
 * Penalize a user for attempting to link a URL with a blocked hostname.
 *
 * Each attempt stacks a new 20% vote weight penalty (source_hostname_id = NULL
 * bypasses the unique constraint that deduplicates initial block penalties).
 *
 * Fire-and-forget: vote weight recalculation is enqueued asynchronously.
 */
export async function penalizeBlockedHostnameAttempt(userId: string): Promise<void> {
  const moderationSystemUserId = await getModerationSystemUserId()
  await insertVoteWeightPenalty({
    userIds: [userId],
    reason: 'blocked_hostname_attempt',
    createdById: moderationSystemUserId,
  })
}
