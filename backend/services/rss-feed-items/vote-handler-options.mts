import {
  getRssFeedItemElectionVote,
  upsertRssFeedItemElectionVotes,
} from '@services/elections-votes/rss-feed-item'
import { getRssFeedItemById } from '@services/rss-feed-items/get'
import {
  createVoteStatsNoopReconciler,
  type ElectionVoteMutationResult,
} from '@services/elections-votes/shared'
import { enqueueBulkUpdateRssFeedItemElectionVoteStats } from '@queues/vote-aggregation/enqueues/elections'
import type {
  CreateVoteHandlerOptions,
  VoteAccessContext,
} from '@services/elections-votes/vote-handler-options'

export const rssFeedItemVoteOptions: CreateVoteHandlerOptions<
  ElectionVoteMutationResult,
  VoteAccessContext
> = {
  rateLimitPrefix: 'rss-feed-item-election-vote',
  routeKey: 'PUT:/api/v1/rss-feed-items/:id/vote',
  requestContractOperation: 'PUT:/api/v1/rss-feed-items/:id/vote',
  entityType: 'rss_feed_item',
  getEntity: getRssFeedItemById,
  entityNotFoundMessage: 'RSS feed item not found',
  votePolicy: 'sentiment',
  getCurrentVote: getRssFeedItemElectionVote,
  upsertVotes: upsertRssFeedItemElectionVotes,
  onNoop: createVoteStatsNoopReconciler(enqueueBulkUpdateRssFeedItemElectionVoteStats),
}
