import type { ChoiceForPolicy, SentimentChoice, VotePolicy } from '@/lib/api/client/elections'
import type { VoteEntityType, VoteChoice } from '@/lib/votes/store'

interface ScoreVoteCommonProps {
  electionId: string
  countUp: number
  countDown: number
  entityType?: VoteEntityType
  clearVote: (id: string) => Promise<void>
  disabled?: boolean
  onError?: (err?: unknown) => void
  signedOut?: boolean
  allowOfficialAccounts?: boolean
  className?: string
  presentation?: 'compact' | 'group'
  hideDownCount?: boolean
  'data-pw'?: string
}

type ScoreVotePolicyProps<P extends VotePolicy> = ScoreVoteCommonProps & {
  policy: P
  existingVoteChoice?: ChoiceForPolicy<P>
  submitVote: (id: string, choice: ChoiceForPolicy<P>) => Promise<void>
}

export type ScoreVoteProps =
  | (ScoreVoteCommonProps & {
      policy?: 'sentiment'
      existingVoteChoice?: SentimentChoice
      submitVote: (id: string, choice: SentimentChoice) => Promise<void>
    })
  | ScoreVotePolicyProps<'recommendation'>
  | ScoreVotePolicyProps<'relation'>
  | ScoreVotePolicyProps<'moderation'>
export interface ScoreVoteState {
  currentVote: VoteChoice
  countUp: number
  countDown: number
  isLoading: boolean
  handleVote: (choice: Exclude<VoteChoice, null>) => Promise<void>
  handleClear: () => Promise<void>
}
