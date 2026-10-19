import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import type { EntityRelationElectionTarget } from '@queues/vote-aggregation/enqueues/types-elections'
import {
  createVoteClearHandler,
  createVoteHandler,
  type CreateVoteHandlerOptions,
} from '../../election-vote-handler.mts'
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
import { ENTITY_RELATION_VOTE_RATE_LIMIT_PREFIX } from '@services/elections-votes/shared'
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
  apiRequestContract,
} from '@vouchington/utils/api-response-contract'
import { apiQuery } from '../../api-query-contract.mts'
import type { ElectionVoteRequest } from '@voucha/types/entities/election'

// These routes name a relation by bare id. The resolver returns the one concrete election it
// belongs to (or 409s when the id exists in several relation tables), so the qualified cache read
// and the id-keyed vote reads/writes below can only touch that relation.
async function getEntityRelationElectionForRoute(id: string) {
  const target = await resolveEntityRelationElectionTargetById(id)
  if (!target) return null
  const [election] = await getEntityRelationElectionByTargetCachedBatch([target])
  return election ? { ...election, target } : null
}

async function getEntityRelationElectionForVoteRoute(id: string) {
  const election = await getEntityRelationElectionForRoute(id)
  if (!election) return null
  const userTagRelation =
    election.target.relationTable === 'relation__user__category__topic'
      ? await getUserTagRelationById(election.id)
      : null
  return { ...election, userTagRelation }
}

type EntityRelationVoteRouteEntity = NonNullable<
  Awaited<ReturnType<typeof getEntityRelationElectionForVoteRoute>>
>

const entityRelationVoteOptions: CreateVoteHandlerOptions = {
  rateLimitPrefix: ENTITY_RELATION_VOTE_RATE_LIMIT_PREFIX,
  routeKey: 'PUT:/api/v1/entity-relations/:id/vote',
  requestContractOperation: 'PUT:/api/v1/entity-relations/:id/vote',
  entityType: 'entity_relation',
  getEntity: getEntityRelationElectionForVoteRoute,
  entityNotFoundMessage: 'Entity relation not found',
  votePolicy: 'relation',
  getCurrentVote: getEntityRelationElectionVote,
  upsertVotes: upsertEntityRelationVotesById,
  shouldAllowOfficialAccount: (currentUser, entity) => {
    const { userTagRelation } = entity as EntityRelationVoteRouteEntity
    return !userTagRelation || isAdminUser(currentUser)
  },
  shouldBypassContributionGating: (currentUser, entity) =>
    isAdminUser(currentUser) && Boolean((entity as EntityRelationVoteRouteEntity).userTagRelation),
  assertAccess: async (_ctx, currentUser, entity) => {
    const relation = (entity as EntityRelationVoteRouteEntity).userTagRelation
    if (relation) {
      assertNotSuspended(currentUser)
      await assertUserTagAllowed(currentUser, relation.subject_id, relation.object_id)
    }
  },
  assertClearAccess: (_ctx, currentUser) => assertNotSuspended(currentUser),
  onVote: async (_currentUser, relationId, _score, entity) => {
    if (!(entity as EntityRelationVoteRouteEntity).userTagRelation) return
    await refreshUserTagVoteStats(relationId, { confirmed: true })
  },
  onNoop: (_currentUser, relationId) => refreshVoteStatsAfterNoop(relationId),
}

function createEntityRelationVoteHandler(isClear: boolean) {
  return async (ctx: Context) => {
    let resolvedTarget: EntityRelationElectionTarget | null | undefined
    const options: CreateVoteHandlerOptions = {
      ...entityRelationVoteOptions,
      ...(isClear
        ? {
            routeKey: 'DELETE:/api/v1/entity-relations/:id/vote',
            requestContractOperation: 'DELETE:/api/v1/entity-relations/:id/vote',
          }
        : {}),
      getCurrentVote: async (userId, entityId) => {
        // Resolve inside the request lock. A relation soft-deleted after preflight must be
        // invisible here, or a neutral PUT writes a zero vote and returns 204 instead of 422.
        resolvedTarget = await resolveEntityRelationElectionTargetById(entityId)
        return resolvedTarget
          ? getEntityRelationElectionVote(userId, entityId, resolvedTarget)
          : null
      },
      upsertVotes: (userId, votes, context) =>
        upsertEntityRelationVotesById(userId, votes, context, resolvedTarget),
    }
    const handler = isClear ? createVoteClearHandler(options) : createVoteHandler(options)
    await handler(ctx)
  }
}

const entityRelationVoteHandler = createEntityRelationVoteHandler(false)
const clearEntityRelationVoteHandler = createEntityRelationVoteHandler(true)

app.route('/api/v1/entity-relations/:id/vote').put(async ctx => {
  apiRequestContract<'PUT:/api/v1/entity-relations/:id/vote', ElectionVoteRequest<'relation'>>(
    'PUT:/api/v1/entity-relations/:id/vote',
  )
  apiNoContent('PUT:/api/v1/entity-relations/:id/vote')
  apiOpenApiNoContent('PUT:/api/v1/entity-relations/:id/vote', 204)
  await entityRelationVoteHandler(ctx)
})

app.route('/api/v1/entity-relations/:id/vote').delete(async ctx => {
  apiNoRequestBody('DELETE:/api/v1/entity-relations/:id/vote')
  apiOpenApiNoContent('DELETE:/api/v1/entity-relations/:id/vote', 204)
  await clearEntityRelationVoteHandler(ctx)
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
    ? await getEntityRelationElectionVotesByElectionId(
        ctx.params.id!,
        { limit, after },
        relation.target,
      )
    : await getEntityRelationElectionVotesByUserForEntity(
        currentUser.id,
        ctx.params.id!,
        { limit, after },
        relation.target,
      )
  ctx.json(collection)
})
