import { getEntityRelationVoteTableIdentifier } from '@data-stores/psql/config-driven/utils/election-sql-identifiers'
import type { EntityElectionConfig } from '../shared/types.mts'

export const ENTITY_RELATION_ELECTION_CONFIG: EntityElectionConfig = {
  entityTable: null,
  voteTable: 'view_entity_relation_votes',
  entityIdColumn: 'entity_relation_id',
  entityType: 'entity_relation_election',
  deletedAtFilter: false,
  votePolicy: 'relation',
}

export function getEntityRelationElectionConfig(relation: string): EntityElectionConfig {
  return {
    ...ENTITY_RELATION_ELECTION_CONFIG,
    voteTable: getEntityRelationVoteTableIdentifier(relation),
  }
}
