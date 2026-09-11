import { createElectionBatchGetter } from '../shared/entity-service.mts'
import { TOPIC_ELECTION_CONFIG } from './config.mts'
import type { ViewTopicElection } from './types.mts'

export const getTopicElectionsByIdBatch =
  createElectionBatchGetter<ViewTopicElection>(TOPIC_ELECTION_CONFIG)
