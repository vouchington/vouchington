import { createVotesUpsert } from '../shared/entity-service.mts'
import { enqueueBulkUpdatePostElectionVoteStats } from '@queues/elections/enqueues'
import { POST_ELECTION_CONFIG } from './config.mts'

export const upsertPostElectionVotes = createVotesUpsert(POST_ELECTION_CONFIG, {
  enqueueElectionStats: enqueueBulkUpdatePostElectionVoteStats,
})
