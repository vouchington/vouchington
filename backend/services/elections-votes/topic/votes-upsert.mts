import { createVotesUpsert } from '../shared/entity-service.mts'
import { enqueueBulkUpdateTopicElectionVoteStats } from '@queues/vote-aggregation/enqueues/elections'
import { enqueueBulkUpdateTopicRatingStatsForTopicId } from '@queues/vote-aggregation/enqueues/topic-ratings'
import { awaitReportedEnqueueAdmission } from '@queues/background/enqueues'
import { TOPIC_ELECTION_CONFIG } from './config.mts'

export const upsertTopicElectionVotes = createVotesUpsert(TOPIC_ELECTION_CONFIG, {
  enqueueElectionStats: enqueueBulkUpdateTopicElectionVoteStats,
  // Topic rating stats depend on raw topic votes as well as reviews,
  // so refresh affected topic metrics directly from the vote write path.
  // Join admission after commit while leaving the queue worker asynchronous.
  afterUpsert: topicIds =>
    awaitReportedEnqueueAdmission(() => enqueueBulkUpdateTopicRatingStatsForTopicId(topicIds)),
})
