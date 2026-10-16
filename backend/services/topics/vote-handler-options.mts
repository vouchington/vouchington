import { getTopicElectionVote, upsertTopicElectionVotes } from '@services/elections-votes/topic'
import {
  createVoteStatsNoopReconciler,
  type ElectionVoteMutationResult,
} from '@services/elections-votes/shared'
import { enqueueBulkUpdateTopicElectionVoteStats } from '@queues/vote-aggregation/enqueues/elections'
import { enqueueBulkUpdateTopicRatingStatsForTopicId } from '@queues/vote-aggregation/enqueues/topic-ratings'
import { getTopicByAnyCached } from './get-cached.mts'
import type {
  CreateVoteHandlerOptions,
  VoteAccessContext,
} from '@services/elections-votes/vote-handler-options'

export const topicVoteOptions: CreateVoteHandlerOptions<
  ElectionVoteMutationResult,
  VoteAccessContext
> = {
  rateLimitPrefix: 'topic-election-vote',
  routeKey: 'PUT:/api/v1/topics/:id/vote',
  requestContractOperation: 'PUT:/api/v1/topics/:id/vote',
  entityType: 'topic',
  getEntity: getTopicByAnyCached,
  entityNotFoundMessage: 'Topic not found',
  votePolicy: 'sentiment',
  upsertVotes: upsertTopicElectionVotes,
  getCurrentVote: getTopicElectionVote,
  onNoop: createVoteStatsNoopReconciler(
    enqueueBulkUpdateTopicElectionVoteStats,
    enqueueBulkUpdateTopicRatingStatsForTopicId,
  ),
}
