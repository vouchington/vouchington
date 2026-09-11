import type { EntityElectionConfig } from '../shared/types.mts'

export const TOPIC_ELECTION_CONFIG: EntityElectionConfig = {
  entityTable: 'topics',
  voteTable: 'topic_votes',
  entityIdColumn: 'topic_id',
  entityType: 'topic_election',
  deletedAtFilter: true,
  tracksNeutralScore: true,
  tracksSemanticScore: true,
  votePolicy: 'sentiment',
}
