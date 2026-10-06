import type { Context } from '@jongleberry/api-server'
import type { PrivateUser } from '@services/users/types'
import app from '../../app.mts'
import { getAgentModerationElectionByIdCachedBatch } from '@services/entity-fetch/get'
import {
  getAgentModerationElectionVotesByElectionId,
  getAgentModerationElectionVote,
} from '@services/elections-votes/agent-moderation'
import { isUUID } from '@modules/utils'
import { createPaginationParser } from '@modules/pagination'
import { isAdminUser } from '@services/users'
import {
  createVoteClearHandler,
  createVoteHandler,
  voteContext,
  type CreateVoteHandlerOptions,
  type VoteRouteContext,
} from '../../election-vote-handler.mts'
import {
  apiNoRequestBody,
  apiOpenApiNoContent,
  apiQuery,
  apiRequestContract,
} from '../../response-contract.mts'
import type { ElectionVoteRequest } from '@voucha/types/entities/election'
import { requireAuthAndRateLimit } from '../../response-helpers.mts'
import { parseAndValidatePaginatedRequest } from '../../validate-paginated-query.mts'
import { upsertAgentModerationVotesWithTrainingEvidence } from '@services/elections-votes/agent-moderation/votes-with-training'
import { createVoteStatsNoopReconciler } from '@services/elections-votes/shared'
import { enqueueBulkUpdateAgentModerationElectionVoteStats } from '@queues/elections/enqueues'

const getAgentModerationElectionForRoute = (id: string) =>
  getAgentModerationElectionByIdCachedBatch([id]).then(elections => elections[0] ?? null)

const upsertAgentModerationVotesWithFeedback: CreateVoteHandlerOptions['upsertVotes'] = (
  userId,
  votes,
  context,
) => upsertAgentModerationVotesWithTrainingEvidence(userId, votes, context, 'staff_or_user')

// PUT /api/v1/agent-moderations/:id/vote (admin only)
const agentModerationVoteHandler = createVoteHandler({
  rateLimitPrefix: 'agent-moderation-election-vote',
  routeKey: 'PUT:/api/v1/agent-moderations/:id/vote',
  requestContractOperation: 'PUT:/api/v1/agent-moderations/:id/vote',
  entityType: 'agent_moderation',
  getEntity: getAgentModerationElectionForRoute,
  entityNotFoundMessage: 'Agent moderation not found',
  votePolicy: 'moderation',
  upsertVotes: upsertAgentModerationVotesWithFeedback,
  getCurrentVote: getAgentModerationElectionVote,
  onNoop: createVoteStatsNoopReconciler(enqueueBulkUpdateAgentModerationElectionVoteStats),
  allowOfficialAccounts: true,
  preAssertAccess: (ctx: VoteRouteContext, currentUser: PrivateUser) => {
    ctx.assert(isAdminUser(currentUser), 403, 'Admin access required')
  },
})

const clearAgentModerationVoteHandler = createVoteClearHandler({
  rateLimitPrefix: 'agent-moderation-election-vote',
  routeKey: 'DELETE:/api/v1/agent-moderations/:id/vote',
  requestContractOperation: 'DELETE:/api/v1/agent-moderations/:id/vote',
  entityType: 'agent_moderation',
  getEntity: getAgentModerationElectionForRoute,
  entityNotFoundMessage: 'Agent moderation not found',
  votePolicy: 'moderation',
  upsertVotes: upsertAgentModerationVotesWithFeedback,
  getCurrentVote: getAgentModerationElectionVote,
  onNoop: createVoteStatsNoopReconciler(enqueueBulkUpdateAgentModerationElectionVoteStats),
  allowOfficialAccounts: true,
  preAssertAccess: (ctx: VoteRouteContext, currentUser: PrivateUser) => {
    ctx.assert(isAdminUser(currentUser), 403, 'Admin access required')
  },
})

app.route('/api/v1/agent-moderations/:id/vote').put(async ctx => {
  apiRequestContract<'PUT:/api/v1/agent-moderations/:id/vote', ElectionVoteRequest<'moderation'>>(
    'PUT:/api/v1/agent-moderations/:id/vote',
  )
  apiOpenApiNoContent('PUT:/api/v1/agent-moderations/:id/vote', 204)
  await agentModerationVoteHandler(voteContext(ctx))
})

app.route('/api/v1/agent-moderations/:id/vote').delete(async ctx => {
  apiNoRequestBody('DELETE:/api/v1/agent-moderations/:id/vote')
  apiOpenApiNoContent('DELETE:/api/v1/agent-moderations/:id/vote', 204)
  await clearAgentModerationVoteHandler(voteContext(ctx))
})

const agentModerationVotesParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 100 },
})

// GET /api/v1/agent-moderations/:id/votes (admin only)
app.route('/api/v1/agent-moderations/:id/votes').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/agent-moderations/:id/votes', agentModerationVotesParser)

  await requireAuthAndRateLimit(ctx, isAdminUser, 'GET:/api/v1/agent-moderations/:id/votes')
  ctx.assert(isUUID(ctx.params.id!), 422, 'Invalid ID')
  const { limit, after } = parseAndValidatePaginatedRequest(
    ctx,
    'GET:/api/v1/agent-moderations/:id/votes',
    agentModerationVotesParser,
    { path: true },
  )

  const moderation = await getAgentModerationElectionForRoute(ctx.params.id!)
  ctx.assert(moderation, 404, 'Agent moderation not found')

  const collection = await getAgentModerationElectionVotesByElectionId(ctx.params.id!, {
    limit,
    after,
  })
  ctx.json(collection)
})
