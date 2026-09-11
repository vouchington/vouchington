import type { EntityElectionConfig } from '../shared/types.mts'

export const USER_VOUCH_ELECTION_CONFIG: EntityElectionConfig = {
  entityTable: 'users',
  voteTable: 'user_vouch_votes',
  entityIdColumn: 'target_user_id',
  entityType: 'user_vouch_election',
  deletedAtFilter: false,
  tracksNeutralScore: true,
  tracksSemanticScore: true,
  votePolicy: 'sentiment',
}
