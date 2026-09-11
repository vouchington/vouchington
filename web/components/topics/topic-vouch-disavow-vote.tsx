'use client'

import { EntityVouchDisavowVote } from '@/components/votes/entity-vouch-disavow-vote'
import { submitTopicVote } from '@/lib/api/client/elections'

interface Props {
  electionId: string
  countUp: number
  countDown: number
  existingVoteChoice?: 'vouch' | 'like' | 'neutral' | 'dislike' | 'disavow'
  signedOut?: boolean
  'data-pw'?: string
}

export function TopicVouchDisavowVote({
  electionId,
  countUp,
  countDown,
  existingVoteChoice,
  signedOut,
  'data-pw': dataPw = 'topic-vouch-disavow-vote',
}: Props) {
  return (
    <EntityVouchDisavowVote
      entityType='topic'
      electionId={electionId}
      countUp={countUp}
      countDown={countDown}
      existingVoteChoice={existingVoteChoice}
      submitVote={(id, choice) =>
        submitTopicVote(id, choice as import('@/lib/api/client/elections').SentimentChoice)
      }
      signedOut={signedOut}
      data-pw={dataPw}
    />
  )
}
