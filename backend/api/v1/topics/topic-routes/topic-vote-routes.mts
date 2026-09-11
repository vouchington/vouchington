import { getTopicElectionVote, upsertTopicElectionVotes } from '@services/elections-votes/topic'
import { createVoteStatsNoopReconciler } from '@services/elections-votes/shared'
import { enqueueBulkUpdateTopicElectionVoteStats } from '@queues/elections/enqueues'
import { enqueueBulkUpdateTopicRatingStatsForTopicId } from '@queues/topic-ratings/enqueues'
import { getTopicByAnyCached } from '@services/entity-fetch'
import app from '../../../app.mts'
import { createVoteClearHandler, createVoteHandler } from '../../../election-vote-handler.mts'
import {
  apiNoRequestBody,
  apiOpenApiNoContent,
  apiRequestContract,
} from '../../../response-contract.mts'
import type { ElectionVoteRequest } from '@voucha/types/entities/election'

// PUT /api/v1/topics/:id/vote
const topicVoteHandler = createVoteHandler({
  rateLimitPrefix: 'topic-election-vote',
  routeKey: 'PUT:/api/v1/topics/:id/vote',
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
})

const clearTopicVoteHandler = createVoteClearHandler({
  rateLimitPrefix: 'topic-election-vote',
  routeKey: 'DELETE:/api/v1/topics/:id/vote',
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
})

app.route('/api/v1/topics/:id/vote').put(async ctx => {
  apiRequestContract<'PUT:/api/v1/topics/:id/vote', ElectionVoteRequest<'sentiment'>>(
    'PUT:/api/v1/topics/:id/vote',
  )
  apiOpenApiNoContent('PUT:/api/v1/topics/:id/vote', 204)
  await topicVoteHandler(ctx)
})

app.route('/api/v1/topics/:id/vote').delete(async ctx => {
  apiNoRequestBody('DELETE:/api/v1/topics/:id/vote')
  apiOpenApiNoContent('DELETE:/api/v1/topics/:id/vote', 204)
  await clearTopicVoteHandler(ctx)
})
