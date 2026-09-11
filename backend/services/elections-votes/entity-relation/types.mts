// Re-export shared types
export type { ElectionVoteScore } from '../shared/index.mts'

export type ViewEntityRelationElection = {
  __entity_type: 'entity_relation_election'
  id: string
  votes_score_net: number
  votes_count_up: number
  votes_count_down: number
}
