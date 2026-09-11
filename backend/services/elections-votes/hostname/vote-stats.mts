import { createVoteStatsUpdater } from '../shared/entity-service.mts'
import { HOSTNAME_ELECTION_CONFIG } from './config.mts'
import { invalidate } from '@services/entity-cache/invalidate'

export const updateHostnameElectionVoteStats = createVoteStatsUpdater(HOSTNAME_ELECTION_CONFIG, {
  invalidate: invalidate.hostname_elections,
})
