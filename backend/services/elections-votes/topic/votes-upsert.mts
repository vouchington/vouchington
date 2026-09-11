import { createVotesUpsert } from '../shared/entity-service.mts'
import { enqueueBulkUpdateTopicElectionVoteStats } from '@queues/elections/enqueues'
import { enqueueBulkUpdateTopicRatingStatsForTopicId } from '@queues/topic-ratings/enqueues'
import { TOPIC_ELECTION_CONFIG } from './config.mts'

export const upsertTopicElectionVotes = createVotesUpsert(TOPIC_ELECTION_CONFIG, {
  enqueueElectionStats: enqueueBulkUpdateTopicElectionVoteStats,
  // Topic rating stats depend on raw topic votes as well as reviews,
  // so refresh affected topic metrics directly from the vote write path.
  // Fire-and-forget like enqueueElectionStats above and the noop reconciler
  // (noop-reconciliation.mts): the queue factory already reports failures via
  // onError internally, so awaiting here would turn a transient Valkey/queue
  // outage into a user-facing 500 after the vote already committed to PostgreSQL.
  afterUpsert: async topicIds => {
    void enqueueBulkUpdateTopicRatingStatsForTopicId(topicIds)
  },
})
