import { electionVotesMapToRecord } from '@modules/utils/collections'
import { getCachedElectionGroups } from '@services/elections-votes/shared/cached-groups'
import { searchPostModerationsByPostIds, type AgentModerationResult } from '@services/moderation'
import { isAdminUser } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import { getPostAndModerationVotes } from '@services/elections-votes/shared/post-moderation-votes'
import type { ElectionVote } from '@services/elections-votes/shared'

export function indexPostModerationsByPostId(
  moderations: AgentModerationResult[],
): Record<string, AgentModerationResult[]> {
  // `Object.groupBy`'s lib types return `Partial<Record<...>>` since a key that never occurs
  // has no entry, but every key actually produced here is guaranteed a non-empty array — the
  // cast narrows back to this function's existing non-partial return contract, not masking a
  // real possible-`undefined` case.
  return Object.groupBy(moderations, moderation => moderation.post_id) as Record<
    string,
    AgentModerationResult[]
  >
}

export function getPostElectionSidecars(currentUser: PrivateUser | null, postIds: string[]) {
  const moderations = isAdminUser(currentUser)
    ? searchPostModerationsByPostIds(postIds)
    : Promise.resolve([])
  const elections = moderations.then(rows =>
    getCachedElectionGroups({
      post: postIds,
      agent_moderation: rows.map(row => row.id),
    }),
  )
  return { moderations, elections }
}

export async function getPostElectionVotesWithModerations(
  userId: string,
  postIds: string[],
  moderations: AgentModerationResult[],
  emptyPostResult: 'object' | 'undefined',
): Promise<Record<string, ElectionVote> | undefined> {
  const moderationIds = [...new Set(moderations.map(moderation => moderation.id))]
  const votes = await getPostAndModerationVotes(userId, postIds, moderationIds)
  const record = electionVotesMapToRecord(new Map(votes.map(vote => [vote.entity_id, vote])))
  if (Object.keys(record).length > 0) return record
  if (moderationIds.length > 0 || (postIds.length === 0 && emptyPostResult === 'undefined'))
    return undefined
  return record
}
