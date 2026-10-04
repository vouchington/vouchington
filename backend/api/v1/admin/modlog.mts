import { parseRuntimePagination } from '@voucha/api/runtime-pagination'
import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuthAndRateLimit, validateRequestContract } from '../../response-helpers.mts'
import { apiQuery, apiResponse } from '../../response-contract.mts'
import { isAdminUser } from '@services/users'
import { searchModeratorActions, MODERATOR_ACTION_TYPES } from '@services/moderator-actions'
import { getUserPublicByAnyCachedBatch } from '@services/entity-fetch'
import {
  createPaginationParser,
  defineQueryContract,
  queryEnum,
  queryUuid,
} from '@modules/pagination'

const parser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { default: 25, max: 100 },
})

const modlogFilterQuery = defineQueryContract({
  community_id: queryUuid(),
  actor_id: queryUuid(),
  action_type: queryEnum(MODERATOR_ACTION_TYPES, { description: 'Unknown values are ignored.' }),
})

// GET /api/v1/admin/modlog
app.route('/api/v1/admin/modlog').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/admin/modlog', parser, modlogFilterQuery)
  await requireAuthAndRateLimit(ctx, isAdminUser, 'GET:/api/v1/admin/modlog')

  const { limit, after } = parseRuntimePagination(parser, ctx.query)
  // Normalize empty strings to undefined so falsy checks are consistent
  const communityId = ctx.query.community_id ? (ctx.query.community_id as string) : undefined
  const actorId = ctx.query.actor_id ? (ctx.query.actor_id as string) : undefined
  const rawActionType = ctx.query.action_type as string | undefined
  const actionType = MODERATOR_ACTION_TYPES.includes(rawActionType as never)
    ? (rawActionType as (typeof MODERATOR_ACTION_TYPES)[number])
    : undefined

  // An unknown action_type is ignored and an empty id is dropped, so the contract checks the
  // settled values: it rejects a malformed or repeated id, as the inline UUID checks did.
  validateRequestContract(ctx, 'GET:/api/v1/admin/modlog', {
    query: {
      limit,
      ...(after !== undefined && { after }),
      ...(communityId && { community_id: communityId }),
      ...(actorId && { actor_id: actorId }),
      ...(actionType && { action_type: actionType }),
    },
  })

  const result = await searchModeratorActions({
    communityId,
    actorId,
    limit,
    after,
    actionType,
  })

  const actorIds: string[] = []
  for (const r of result.results) {
    if (r.actor_id !== null) actorIds.push(r.actor_id)
  }
  const actors = await getUserPublicByAnyCachedBatch(actorIds).then(us =>
    us.reduce<Record<string, unknown>>((acc, u) => {
      if (u) acc[u.id] = u
      return acc
    }, {}),
  )

  ctx.json(
    apiResponse('GET:/api/v1/admin/modlog', {
      results: result.results.map(r => ({
        __entity_type: 'moderator_action' as const,
        id: r.id,
      })),
      page_info: result.page_info,
      moderator_actions: result.results.reduce<Record<string, unknown>>((acc, r) => {
        acc[r.id] = r
        return acc
      }, {}),
      users: actors,
    }),
  )
})
