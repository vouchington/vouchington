import { createElectionBatchGetter } from '../shared/entity-service.mts'
import { POST_ELECTION_CONFIG } from './config.mts'
import type { ViewPostElection } from './types.mts'

export const getPostElectionsByIdBatch =
  createElectionBatchGetter<ViewPostElection>(POST_ELECTION_CONFIG)
