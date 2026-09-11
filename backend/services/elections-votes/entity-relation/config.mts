import type { EntityElectionConfig } from '../shared/types.mts'

export const ENTITY_RELATION_ELECTION_CONFIG: EntityElectionConfig = {
  entityTable: null,
  voteTable: 'entity_relation_votes',
  entityIdColumn: 'entity_relation_id',
  entityType: 'entity_relation_election',
  deletedAtFilter: false,
  votePolicy: 'relation',
}
