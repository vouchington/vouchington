import { createVoteGetByUser, createVotesGetByElectionId } from '../shared/entity-service.mts'
import { AGENT_MODERATION_ELECTION_CONFIG } from './config.mts'

export const getAgentModerationElectionVote = createVoteGetByUser<'moderation'>(
  AGENT_MODERATION_ELECTION_CONFIG,
)
export const getAgentModerationElectionVotesByElectionId = createVotesGetByElectionId<'moderation'>(
  AGENT_MODERATION_ELECTION_CONFIG,
)
