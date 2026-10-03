import { getFollowedUsersByElectionVote } from '@services/users/follow-context'
import { getUserVouchElectionVote } from '@services/elections-votes/user-vouch'
import type { PrivateUser } from '@services/users/types'

export async function getUserVouchContextResponse(currentUser: PrivateUser, targetId: string) {
  const [positive_by_following, negative_by_following, election_vote] = await Promise.all([
    getFollowedUsersByElectionVote(currentUser, targetId, 'user_vouch_votes', 1),
    getFollowedUsersByElectionVote(currentUser, targetId, 'user_vouch_votes', -1),
    getUserVouchElectionVote(currentUser.id, targetId),
  ])
  return { positive_by_following, negative_by_following, election_vote }
}
