import app from '../../app.mts'
import { createVoteClearHandler, createVoteHandler } from '../../election-vote-handler.mts'
import {
  apiNoRequestBody,
  apiOpenApiNoContent,
  apiRequestContract,
} from '../../response-contract.mts'
import { getUrlHostnameByAnyCached } from '@services/entity-fetch/get'
import {
  getHostnameElectionVote,
  upsertHostnameElectionVotes,
} from '@services/elections-votes/hostname'
import { currentUserCanFilterHostnameModeration } from '@services/urls-hostnames'
import type { ElectionVoteRequest } from '@voucha/types/entities/election'
import { createVoteStatsNoopReconciler } from '@services/elections-votes/shared'
import { enqueueBulkUpdateHostnameElectionVoteStats } from '@queues/elections/enqueues'

const hostnameVoteHandler = createVoteHandler({
  rateLimitPrefix: 'hostname-election-vote',
  routeKey: 'PUT:/api/v1/hostnames/:id/vote',
  entityType: 'hostname',
  getEntity: getUrlHostnameByAnyCached,
  entityNotFoundMessage: 'Hostname not found',
  votePolicy: 'sentiment',
  getCurrentVote: getHostnameElectionVote,
  upsertVotes: upsertHostnameElectionVotes,
  onNoop: createVoteStatsNoopReconciler(enqueueBulkUpdateHostnameElectionVoteStats),
  assertAccess: (ctx, currentUser, hostname) => {
    if (isBlockedHostname(hostname) && !currentUserCanFilterHostnameModeration(currentUser))
      ctx.throw(404, 'Hostname not found')
  },
})

const clearHostnameVoteHandler = createVoteClearHandler({
  rateLimitPrefix: 'hostname-election-vote',
  routeKey: 'DELETE:/api/v1/hostnames/:id/vote',
  entityType: 'hostname',
  getEntity: getUrlHostnameByAnyCached,
  entityNotFoundMessage: 'Hostname not found',
  votePolicy: 'sentiment',
  upsertVotes: upsertHostnameElectionVotes,
  getCurrentVote: getHostnameElectionVote,
  onNoop: createVoteStatsNoopReconciler(enqueueBulkUpdateHostnameElectionVoteStats),
  assertClearAccess: async (ctx, currentUser, hostname) => {
    if (
      isBlockedHostname(hostname) &&
      !currentUserCanFilterHostnameModeration(currentUser) &&
      (await getHostnameElectionVote(currentUser.id, ctx.params.id!)) === null
    )
      ctx.throw(404, 'Hostname not found')
  },
})

app.route('/api/v1/hostnames/:id/vote').put(async ctx => {
  apiRequestContract<'PUT:/api/v1/hostnames/:id/vote', ElectionVoteRequest<'sentiment'>>(
    'PUT:/api/v1/hostnames/:id/vote',
  )
  apiOpenApiNoContent('PUT:/api/v1/hostnames/:id/vote', 204)
  await hostnameVoteHandler(ctx)
})

app.route('/api/v1/hostnames/:id/vote').delete(async ctx => {
  apiNoRequestBody('DELETE:/api/v1/hostnames/:id/vote')
  apiOpenApiNoContent('DELETE:/api/v1/hostnames/:id/vote', 204)
  await clearHostnameVoteHandler(ctx)
})

function isBlockedHostname(hostname: unknown): hostname is { blocked: boolean } {
  return (
    typeof hostname === 'object' &&
    hostname !== null &&
    'blocked' in hostname &&
    (hostname as { blocked?: unknown }).blocked === true
  )
}
