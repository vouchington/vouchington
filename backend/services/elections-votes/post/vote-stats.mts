import { createVoteStatsUpdater } from '../shared/entity-service.mts'
import { POST_ELECTION_CONFIG } from './config.mts'
import { invalidate } from '@services/entity-cache'

export const updatePostElectionVoteStats = createVoteStatsUpdater(POST_ELECTION_CONFIG, {
  invalidate: invalidate.post_elections,
})
