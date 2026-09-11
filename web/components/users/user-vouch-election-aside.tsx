import { getUserVouchContext } from '@/lib/api/server'
import { UserVouchElectionCard } from './user-vouch-election-card'

function isSentimentChoice(
  choice: import('@/lib/api/client/elections').ElectionVoteChoice | undefined,
): choice is import('@/lib/api/client/elections').SentimentChoice {
  return (
    choice === 'vouch' ||
    choice === 'like' ||
    choice === 'neutral' ||
    choice === 'dislike' ||
    choice === 'disavow'
  )
}

export async function UserVouchElectionAside({
  userId,
  displayName,
  canCreateTrustSignal,
}: {
  userId: string
  displayName: string
  canCreateTrustSignal: boolean
}) {
  const context = await getUserVouchContext(userId)
  const choice = context?.election_vote?.choice
  return (
    <UserVouchElectionCard
      userId={userId}
      displayName={displayName}
      initialChoice={isSentimentChoice(choice) ? choice : null}
      canCreateTrustSignal={canCreateTrustSignal}
    />
  )
}
