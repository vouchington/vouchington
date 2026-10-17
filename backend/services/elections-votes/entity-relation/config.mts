import { getEntityRelationVoteTableIdentifier } from '@data-stores/psql/config-driven/utils/election-sql-identifiers'
import type { EntityElectionConfig } from '../shared/types.mts'

export function getEntityRelationElectionConfig(relation: string): EntityElectionConfig {
  return {
    entityTable: null,
    voteTable: getEntityRelationVoteTableIdentifier(relation),
    entityIdColumn: 'entity_relation_id',
    entityType: 'entity_relation_election',
    deletedAtFilter: false,
    votePolicy: 'relation',
  }
}
