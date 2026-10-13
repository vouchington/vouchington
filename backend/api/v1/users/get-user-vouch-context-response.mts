import { getUserVouchElectionVote } from '@services/elections-votes/user-vouch'
import { getVoteFollowContextBatch } from '@services/users/follow-context'
import type { PrivateUser } from '@services/users/types'

export async function getUserVouchContextResponse(currentUser: PrivateUser, targetId: string) {
  const [followContext, election_vote] = await Promise.all([
    getVoteFollowContextBatch(currentUser, targetId, 'user_vouch_votes'),
    getUserVouchElectionVote(currentUser.id, targetId),
  ])
  return {
    positive_by_following: followContext.positiveByFollowing,
    negative_by_following: followContext.negativeByFollowing,
    election_vote,
  }
}
