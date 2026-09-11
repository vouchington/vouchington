import { createElectionGetter } from '../shared/entity-service.mts'
import { POST_ELECTION_CONFIG } from './config.mts'
import type { ViewPostElection } from './types.mts'

export const getPostElectionById = createElectionGetter<ViewPostElection>(POST_ELECTION_CONFIG)
