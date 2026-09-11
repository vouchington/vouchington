import { createElectionBatchGetter } from '../shared/entity-service.mts'
import { HOSTNAME_ELECTION_CONFIG } from './config.mts'
import type { ViewHostnameElection } from './types.mts'

export const getHostnameElectionsByIdBatch =
  createElectionBatchGetter<ViewHostnameElection>(HOSTNAME_ELECTION_CONFIG)
