import { isPlatformAccount } from '@services/users'
import type { BasicUser } from '@services/users/types'
import { upsertTopicElectionVotes } from './votes-upsert.mts'

/**
 * The automatic +1 a member casts when they create or re-suggest a topic-backed source (RSS feed,
 * fediverse instance). A platform account still creates the source but casts no vote, because the
 * topic writer rejects every non-null vote from an official, system or ai_agent account.
 */
export async function upsertAutomaticTopicUpvote(
  user: Pick<BasicUser, 'id' | 'account_type'>,
  topicId: string,
): Promise<void> {
  if (isPlatformAccount(user)) return
  await upsertTopicElectionVotes(user.id, [{ entityId: topicId, score: 1 }])
}
