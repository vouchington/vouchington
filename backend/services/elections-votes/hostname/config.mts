import type { EntityElectionConfig } from '../shared/types.mts'

export const HOSTNAME_ELECTION_CONFIG: EntityElectionConfig = {
  entityTable: 'url_hostnames',
  voteTable: 'hostname_votes',
  entityIdColumn: 'hostname_id',
  entityType: 'hostname_election',
  deletedAtFilter: false,
  tracksNeutralScore: true,
  tracksSemanticScore: true,
  votePolicy: 'sentiment',
}
