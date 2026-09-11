'use client'

import { EntityVouchDisavowVote } from '@/components/votes/entity-vouch-disavow-vote'
import { submitHostnameVote } from '@/lib/api/client/elections'

interface Props {
  electionId: string
  countUp: number
  countDown: number
  existingVoteChoice?: 'vouch' | 'like' | 'neutral' | 'dislike' | 'disavow'
  signedOut?: boolean
  'data-pw'?: string
}

export function HostnameVouchDisavowVote({
  electionId,
  countUp,
  countDown,
  existingVoteChoice,
  signedOut,
  'data-pw': dataPw = 'hostname-vouch-disavow-vote',
}: Props) {
  return (
    <EntityVouchDisavowVote
      entityType='hostname'
      electionId={electionId}
      countUp={countUp}
      countDown={countDown}
      existingVoteChoice={existingVoteChoice}
      submitVote={(id, choice) =>
        submitHostnameVote(id, choice as import('@/lib/api/client/elections').SentimentChoice)
      }
      signedOut={signedOut}
      data-pw={dataPw}
    />
  )
}
