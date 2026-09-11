import { createVoteStatsUpdater } from '../shared/entity-service.mts'
import { invalidate } from '@services/entity-cache'
import { AGENT_MODERATION_ELECTION_CONFIG } from './config.mts'

export const updateAgentModerationElectionVoteStats = createVoteStatsUpdater(
  AGENT_MODERATION_ELECTION_CONFIG,
  {
    invalidate: agentModerationId => invalidate.agent_moderation_elections(agentModerationId),
  },
)
