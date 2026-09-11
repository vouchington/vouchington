'use client'

import { ScoreVote } from '@/components/votes/score-vote'
import { clearHostnameVote, clearTopicVote, type SentimentChoice } from '@/lib/api/client/elections'
import type { VoteEntityType } from '@/lib/votes/store'

interface EntityVouchDisavowVoteProps {
  entityType: Extract<VoteEntityType, 'topic' | 'hostname'>
  electionId: string
  countUp: number
  countDown: number
  existingVoteChoice?: 'vouch' | 'like' | 'neutral' | 'dislike' | 'disavow'
  signedOut?: boolean
  submitVote: (id: string, choice: SentimentChoice) => Promise<void>
  noun?: string
  'data-pw'?: string
}

export function EntityVouchDisavowVote({
  entityType,
  electionId,
  countUp,
  countDown,
  existingVoteChoice,
  signedOut,
  submitVote,
  'data-pw': dataPw = 'entity-vouch-disavow-vote',
}: EntityVouchDisavowVoteProps) {
  return (
    <ScoreVote
      entityType={entityType}
      electionId={electionId}
      countUp={countUp}
      countDown={countDown}
      existingVoteChoice={existingVoteChoice}
      policy='sentiment'
      clearVote={id => (entityType === 'topic' ? clearTopicVote(id) : clearHostnameVote(id))}
      submitVote={(id, choice) => submitVote(id, choice as SentimentChoice)}
      signedOut={signedOut}
      data-pw={dataPw}
    />
  )
}
