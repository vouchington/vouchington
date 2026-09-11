import { createElectionGetter } from '../shared/entity-service.mts'
import type { ViewUserVouchElection } from './types.mts'
import { USER_VOUCH_ELECTION_CONFIG } from './config.mts'

export const getUserVouchElectionById = createElectionGetter<ViewUserVouchElection>(
  USER_VOUCH_ELECTION_CONFIG,
)
