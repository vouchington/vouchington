import { createVotesUpsert } from '../shared/entity-service.mts'
import { HOSTNAME_ELECTION_CONFIG } from './config.mts'
import { enqueueBulkUpdateHostnameElectionVoteStats } from '@queues/elections/enqueues'

export const upsertHostnameElectionVotes = createVotesUpsert(HOSTNAME_ELECTION_CONFIG, {
  enqueueElectionStats: enqueueBulkUpdateHostnameElectionVoteStats,
})
