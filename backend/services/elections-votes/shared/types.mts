import type { ElectionVoteEvent, ElectionVoteScore } from '@voucha/types/entities/election'

export type ElectionVoteMutationResult = ElectionVoteEvent & {
  id: string
  /** Internal only; route responses never serialize numeric ballots. */
  score: ElectionVoteScore
  outbound_ap_like_activity_id: string | null
  previous_outbound_ap_like_activity_id: string | null
}

export { ELECTION_VOTE_POLICY_SCORES } from '@voucha/types/entities/election'

// API-facing entity types — canonical definitions live in @voucha/types/entities/election
export type {
  ElectionVoteScore,
  ElectionVoteChoice,
  ElectionVotePolicy,
  ViewBaseElection,
  ElectionVote,
  ElectionVoteEvent,
  AggregatedElectionStats,
  EntityElectionConfig,
  VoteEventContext,
} from '@voucha/types/entities/election'
