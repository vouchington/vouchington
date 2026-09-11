import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  createVoteClearHandler,
  createVoteHandler,
  type CreateVoteHandlerOptions,
} from '../../election-vote-handler.mts'
import { getEntityRelationElectionByIdCachedBatch } from '@services/entity-fetch/get'
import {
  getEntityRelationElectionVotesByElectionId,
  getEntityRelationElectionVotesByUserForEntity,
  getEntityRelationElectionVote,
  upsertEntityRelationElectionVotes,
} from '@services/elections-votes/entity-relation'
import { getUserTagRelationById } from '@services/entity-relations/user-tags'
import { assertNotSuspended, isAdminUser } from '@services/users'
import { isUUID } from '@modules/utils'
import { createPaginationParser } from '@modules/pagination'
import onError from '@modules/on-error'
import { requireAuth } from '../../response-helpers.mts'
import { assertUserTagAllowed } from './user-tag-access.mts'
import {
  refreshEntityRelationVoteStatsById,
  refreshEntityRelationVoteStatsFromPrimaryWithFallback,
} from '@services/elections-votes/entity-relation/refresh-stats'
import { createEntityRelationElectionTarget } from '@services/elections-votes/entity-relation/target'
import {
  apiNoContent,
  apiNoRequestBody,
  apiOpenApiNoContent,
  apiQuery,
  apiRequestContract,
} from '../../response-contract.mts'
import type { ElectionVoteRequest } from '@voucha/types/entities/election'

const getEntityRelationElectionForRoute = (id: string) =>
  getEntityRelationElectionByIdCachedBatch([id]).then(elections => elections[0] ?? null)

async function refreshUserTagVoteStats(relationId: string): Promise<void> {
  if (await getUserTagRelationById(relationId)) {
    await refreshEntityRelationVoteStatsFromPrimaryWithFallback(
      createEntityRelationElectionTarget(relationId, 'relation__user__category__topic'),
    )
  }
}

const entityRelationVoteOptions: CreateVoteHandlerOptions = {
  rateLimitPrefix: 'entity-relation-election-vote',
  routeKey: 'PUT:/api/v1/entity-relations/:id/vote',
  entityType: 'entity_relation',
  getEntity: getEntityRelationElectionForRoute,
  entityNotFoundMessage: 'Entity relation not found',
  votePolicy: 'relation',
  getCurrentVote: getEntityRelationElectionVote,
  upsertVotes: async (userId, votes, context) => {
    const isUserTagVote =
      votes.length === 1 && Boolean(await getUserTagRelationById(votes[0]!.entityId))
    return upsertEntityRelationElectionVotes(userId, votes, context, undefined, {
      enqueueVoteStats: !isUserTagVote,
    })
  },
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
  onNoop: (_currentUser, relationId) => {
    void refreshEntityRelationVoteStatsById(relationId).catch(onError)
  },
}

const entityRelationVoteHandler = createVoteHandler(entityRelationVoteOptions)

const clearEntityRelationVoteHandler = createVoteClearHandler({
  ...entityRelationVoteOptions,
  routeKey: 'DELETE:/api/v1/entity-relations/:id/vote',
})

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
  ctx.assert(isUUID(ctx.params.id!), 422, 'Invalid ID')
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/entity-relations/:id/votes')
  const relation = await getEntityRelationElectionForRoute(ctx.params.id!)
  ctx.assert(relation, 404, 'Entity relation not found')

  const { limit, after } = entityRelationVotesParser.parse(ctx.query)
  const collection = isAdminUser(currentUser)
    ? await getEntityRelationElectionVotesByElectionId(ctx.params.id!, { limit, after })
    : await getEntityRelationElectionVotesByUserForEntity(currentUser.id, ctx.params.id!, {
        limit,
        after,
      })
  ctx.json(collection)
})
