import { caches } from '@services/entity-cache/caches'
import { getUrlHostnameByAny } from '@services/urls-hostnames/get'
import { currentUserCanViewHostname } from '@services/urls-hostnames/authorization'
import { enqueueBulkUpdateHostnameElectionVoteStats } from '@queues/vote-aggregation/enqueues/elections'
import { createVoteStatsNoopReconciler, type ElectionVoteMutationResult } from '../shared/index.mts'
import type { CreateVoteHandlerOptions, VoteAccessContext } from '../vote-handler-options.mts'
import { getHostnameElectionVote } from './votes-get.mts'
import { upsertHostnameElectionVotes } from './votes-upsert.mts'

const HOSTNAME_NOT_FOUND = 'Hostname not found'
const getUrlHostnameByAnyCached = caches.url_hostnames.cacheGetByAny(getUrlHostnameByAny)

export const hostnameVoteOptions: CreateVoteHandlerOptions<
  ElectionVoteMutationResult,
  VoteAccessContext
> = {
  rateLimitPrefix: 'hostname-election-vote',
  routeKey: 'PUT:/api/v1/hostnames/:id/vote',
  requestContractOperation: 'PUT:/api/v1/hostnames/:id/vote',
  entityType: 'hostname',
  getEntity: getUrlHostnameByAnyCached,
  entityNotFoundMessage: HOSTNAME_NOT_FOUND,
  votePolicy: 'sentiment',
  getCurrentVote: getHostnameElectionVote,
  upsertVotes: upsertHostnameElectionVotes,
  onNoop: createVoteStatsNoopReconciler(enqueueBulkUpdateHostnameElectionVoteStats),
  assertAccess: (ctx: VoteAccessContext, currentUser, hostname) => {
    ctx.assert(currentUserCanViewHostname(currentUser, hostname), 404, HOSTNAME_NOT_FOUND)
  },
  // A member may withdraw a ballot cast while the hostname was public, even after it is hidden.
  assertClearAccess: async (ctx: VoteAccessContext, currentUser, hostname) => {
    if (currentUserCanViewHostname(currentUser, hostname)) return
    const { id, publicly_introduced_at: introducedAt } = hostname as {
      id: string
      publicly_introduced_at?: unknown
    }
    const hasBallot = !!introducedAt && (await getHostnameElectionVote(currentUser.id, id)) !== null
    ctx.assert(hasBallot, 404, HOSTNAME_NOT_FOUND)
  },
}
