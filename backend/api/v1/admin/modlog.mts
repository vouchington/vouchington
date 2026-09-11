import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuthAndRateLimit } from '../../response-helpers.mts'
import { isAdminUser } from '@services/users'
import { searchModeratorActions, MODERATOR_ACTION_TYPES } from '@services/moderator-actions'
import { getUserPublicByAnyCachedBatch } from '@services/entity-fetch'
import { createPaginationParser } from '@modules/pagination'
import { isUUID } from '@modules/utils'

const parser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { default: 25, max: 100 },
})

// GET /api/v1/admin/modlog
app.route('/api/v1/admin/modlog').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, isAdminUser, 'GET:/api/v1/admin/modlog')

  const { limit, after } = parser.parse(ctx.query)
  // Normalize empty strings to undefined so falsy checks are consistent
  const communityId = ctx.query.community_id ? (ctx.query.community_id as string) : undefined
  const actorId = ctx.query.actor_id ? (ctx.query.actor_id as string) : undefined
  const rawActionType = ctx.query.action_type as string | undefined
  const actionType = MODERATOR_ACTION_TYPES.includes(rawActionType as never)
    ? (rawActionType as (typeof MODERATOR_ACTION_TYPES)[number])
    : undefined

  ctx.assert(!communityId || isUUID(communityId), 422, 'Invalid community_id')
  ctx.assert(!actorId || isUUID(actorId), 422, 'Invalid actor_id')

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

  ctx.json({
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
  })
})
