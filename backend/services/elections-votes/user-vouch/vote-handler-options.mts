import { getPublicUserByAny } from '@services/users'
import { enqueueBulkUpdateUserVouchElectionVoteStats } from '@queues/vote-aggregation/enqueues/elections'
import { createVoteStatsNoopReconciler, type ElectionVoteMutationResult } from '../shared/index.mts'
import type { CreateVoteHandlerOptions, VoteAccessContext } from '../vote-handler-options.mts'
import { getUserVouchElectionVote } from './votes-get.mts'
import { upsertUserVouchElectionVotes } from './votes-upsert.mts'

export const userVouchVoteOptions: CreateVoteHandlerOptions<
  ElectionVoteMutationResult,
  VoteAccessContext
> = {
  rateLimitPrefix: 'user-vouch-election-vote',
  routeKey: 'PUT:/api/v1/users/:id/vouch-vote',
  requestContractOperation: 'PUT:/api/v1/users/:id/vouch-vote',
  entityType: 'user_vouch',
  getEntity: getPublicUserByAny,
  entityNotFoundMessage: 'User not found',
  votePolicy: 'sentiment',
  upsertVotes: upsertUserVouchElectionVotes,
  getCurrentVote: getUserVouchElectionVote,
  onNoop: createVoteStatsNoopReconciler(enqueueBulkUpdateUserVouchElectionVoteStats),
  assertAccess: (ctx: VoteAccessContext, currentUser, entity) => {
    ctx.assert((entity as { id: string }).id !== currentUser.id, 403, 'Cannot vote on yourself')
  },
  enqueueIntegrityCheck: false,
}
