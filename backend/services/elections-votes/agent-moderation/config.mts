import type { EntityElectionConfig } from '../shared/types.mts'

export const AGENT_MODERATION_ELECTION_CONFIG: EntityElectionConfig = {
  entityTable: 'agent_moderations',
  voteTable: 'agent_moderation_votes',
  entityIdColumn: 'agent_moderation_id',
  entityType: 'agent_moderation_election',
  deletedAtFilter: true,
  votePolicy: 'moderation',
}
