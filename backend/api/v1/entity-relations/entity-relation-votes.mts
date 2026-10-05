import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { handleElectionVote, type CreateVoteHandlerOptions } from '../../election-vote-handler.mts'
import { getEntityRelationElectionByTargetCachedBatch } from '@services/entity-fetch/get'
import {
  getEntityRelationElectionVotesByElectionId,
  getEntityRelationElectionVotesByUserForEntity,
  getEntityRelationElectionVote,
  refreshUserTagVoteStats,
  refreshVoteStatsAfterNoop,
  resolveEntityRelationElectionTargetById,
  upsertEntityRelationVotesById,
} from '@services/elections-votes/entity-relation'
import { getUserTagRelationById } from '@services/entity-relations/user-tags'
import { assertNotSuspended, isAdminUser } from '@services/users'
import { isUUID } from '@modules/utils'
import { createPaginationParser } from '@modules/pagination'
import { requireAuth } from '../../response-helpers.mts'
import { parseAndValidatePaginatedRequest } from '../../validate-paginated-query.mts'
import { assertUserTagAllowed } from '@services/entity-relation-actions'
import {
  apiNoContent,
  apiNoRequestBody,
  apiOpenApiNoContent,
  apiQuery,
  apiRequestContract,
} from '../../response-contract.mts'
import type { ElectionVoteRequest } from '@voucha/types/entities/election'

// These routes name a relation by bare id. The resolver returns the one concrete election it
// belongs to (or 409s when the id exists in several relation tables), so the qualified cache read
// and the id-keyed vote reads/writes below can only touch that relation.
async function getEntityRelationElectionForRoute(id: string) {
  const target = await resolveEntityRelationElectionTargetById(id)
  if (!target) return null
  const [election] = await getEntityRelationElectionByTargetCachedBatch([target])
  return election ?? null
}

const entityRelationVoteOptions: CreateVoteHandlerOptions = {
  rateLimitPrefix: 'entity-relation-election-vote',
  routeKey: 'PUT:/api/v1/entity-relations/:id/vote',
  requestContractOperation: 'PUT:/api/v1/entity-relations/:id/vote',
  entityType: 'entity_relation',
  getEntity: getEntityRelationElectionForRoute,
  entityNotFoundMessage: 'Entity relation not found',
  votePolicy: 'relation',
  getCurrentVote: getEntityRelationElectionVote,
  upsertVotes: upsertEntityRelationVotesById,
  shouldAllowOfficialAccount: async (currentUser, entity) => {
    const userTagRelation = await getUserTagRelationById((entity as { id: string }).id)
    return !userTagRelation || isAdminUser(currentUser)
  },
  shouldBypassContributionGating: async (currentUser, entity) =>
    isAdminUser(currentUser) &&
    Boolean(await getUserTagRelationById((entity as { id: string }).id)),
  assertAccess: async (_ctx, currentUser, entity) => {
    const relation = await getUserTagRelationById((entity as { id: string }).id)
    if (relation) {
      assertNotSuspended(currentUser)
      await assertUserTagAllowed(currentUser, relation.subject_id, relation.object_id)
    }
  },
  assertClearAccess: (_ctx, currentUser) => assertNotSuspended(currentUser),
  onVote: async (_currentUser, relationId) => refreshUserTagVoteStats(relationId),
  onNoop: (_currentUser, relationId) => refreshVoteStatsAfterNoop(relationId),
}

const clearEntityRelationVoteOptions: CreateVoteHandlerOptions = {
  ...entityRelationVoteOptions,
  routeKey: 'DELETE:/api/v1/entity-relations/:id/vote',
  requestContractOperation: 'DELETE:/api/v1/entity-relations/:id/vote',
}

app.route('/api/v1/entity-relations/:id/vote').put(async ctx => {
  apiRequestContract<'PUT:/api/v1/entity-relations/:id/vote', ElectionVoteRequest<'relation'>>(
    'PUT:/api/v1/entity-relations/:id/vote',
  )
  apiNoContent('PUT:/api/v1/entity-relations/:id/vote')
  apiOpenApiNoContent('PUT:/api/v1/entity-relations/:id/vote', 204)
  await handleElectionVote(ctx, entityRelationVoteOptions, false)
})

app.route('/api/v1/entity-relations/:id/vote').delete(async ctx => {
  apiNoRequestBody('DELETE:/api/v1/entity-relations/:id/vote')
  apiOpenApiNoContent('DELETE:/api/v1/entity-relations/:id/vote', 204)
  await handleElectionVote(ctx, clearEntityRelationVoteOptions, true)
})

const entityRelationVotesParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 100 },
})

app.route('/api/v1/entity-relations/:id/votes').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/entity-relations/:id/votes', entityRelationVotesParser)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/entity-relations/:id/votes')
  ctx.assert(isUUID(ctx.params.id!), 422, 'Invalid ID')
  const { limit, after } = parseAndValidatePaginatedRequest(
    ctx,
    'GET:/api/v1/entity-relations/:id/votes',
    entityRelationVotesParser,
    { path: true },
  )
  const relation = await getEntityRelationElectionForRoute(ctx.params.id!)
  ctx.assert(relation, 404, 'Entity relation not found')

  const collection = isAdminUser(currentUser)
    ? await getEntityRelationElectionVotesByElectionId(ctx.params.id!, { limit, after })
    : await getEntityRelationElectionVotesByUserForEntity(currentUser.id, ctx.params.id!, {
        limit,
        after,
      })
  ctx.json(collection)
})
