import { createElectionBatchGetter } from '../shared/entity-service.mts'
import { AGENT_MODERATION_ELECTION_CONFIG } from './config.mts'
import type { ViewAgentModerationElection } from './types.mts'

export const getAgentModerationElectionsByIdBatch =
  createElectionBatchGetter<ViewAgentModerationElection>(AGENT_MODERATION_ELECTION_CONFIG)
