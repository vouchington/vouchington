import { createVoteStatsUpdater } from '../shared/entity-service.mts'
import { USER_VOUCH_ELECTION_CONFIG } from './config.mts'

export const updateUserVouchElectionVoteStats = createVoteStatsUpdater(USER_VOUCH_ELECTION_CONFIG, {
  invalidate: async () => {},
})
