import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  parseJsonBody,
  requireAuth,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import {
  getCommunityOrThrow,
  getCommunityMember,
  currentUserCanManageCommunityBans,
  banUserFromCommunity,
  liftCommunityBan,
  searchCommunityBans,
} from '@services/communities'
import { assertNotSuspended } from '@services/users'
import { isUUID } from '@modules/utils'
import { getUserPublicByAnyCachedBatch } from '@services/entity-fetch'

app
  .route('/api/v1/communities/:idOrSlug/bans')
  .get(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'GET:/api/v1/communities/:idOrSlug/bans')
    const { idOrSlug } = ctx.params as { idOrSlug: string }

    const community = await getCommunityOrThrow(idOrSlug)
    const membership = await getCommunityMember(community.id, currentUser.id)

    ctx.assert(
      currentUserCanManageCommunityBans(currentUser, community, membership),
      403,
      'Forbidden',
    )
    validateRequestContract(ctx, 'GET:/api/v1/communities/:idOrSlug/bans', { path: ctx.params })

    const limit = ctx.query.limit ? Number(ctx.query.limit) : undefined
    const after = ctx.query.after as string | undefined

    const result = await searchCommunityBans(community.id, { limit, after })

    const userIds = result.results.map(b => b.user_id)
    const users = await getUserPublicByAnyCachedBatch(userIds).then(us =>
      us.reduce<Record<string, unknown>>((acc, u) => {
        if (u) acc[u.id] = u
        return acc
      }, {}),
    )

    ctx.json({
      results: result.results.map(b => ({ __entity_type: 'community_ban' as const, id: b.id })),
      page_info: result.page_info,
      community_bans: result.results.reduce<Record<string, unknown>>((acc, b) => {
        const { case_id: _, ...banForResponse } = b
        acc[b.id] = banForResponse
        return acc
      }, {}),
      users,
    })
  })
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'POST:/api/v1/communities/:idOrSlug/bans')
    assertNotSuspended(currentUser)

    const { idOrSlug } = ctx.params as { idOrSlug: string }
    const community = await getCommunityOrThrow(idOrSlug)
    ctx.assert(!community.archived_at, 403, 'Community is archived')
    const membership = await getCommunityMember(community.id, currentUser.id)

    ctx.assert(
      currentUserCanManageCommunityBans(currentUser, community, membership),
      403,
      'Forbidden',
    )

    const body = await parseJsonBody<{ user_id?: unknown; reason?: unknown; expires_at?: unknown }>(
      ctx,
    )
    validateRequestContract(ctx, 'POST:/api/v1/communities/:idOrSlug/bans', {
      path: ctx.params,
      body,
    })
    ctx.assert(body.user_id, 422, 'user_id is required')
    ctx.assert(
      typeof body.user_id === 'string' && isUUID(body.user_id),
      422,
      'user_id must be a valid UUID',
    )
    ctx.assert(
      body.reason === undefined || body.reason === null || typeof body.reason === 'string',
      422,
      'reason must be a string',
    )

    let expiresAt: Date | undefined
    if (body.expires_at !== undefined && body.expires_at !== null) {
      ctx.assert(typeof body.expires_at === 'string', 422, 'expires_at must be an ISO date string')
      expiresAt = new Date(body.expires_at as string)
      ctx.assert(!isNaN(expiresAt.getTime()), 422, 'expires_at is not a valid date')
      ctx.assert(expiresAt > new Date(), 422, 'expires_at must be in the future')
    }

    const ban = await banUserFromCommunity(currentUser, community.id, body.user_id as string, {
      reason: typeof body.reason === 'string' ? body.reason : undefined,
      expiresAt,
    })

    const { case_id: _, ...banForResponse } = ban
    ctx.setStatus(201)
    ctx.json({ community_ban: banForResponse })
  })

app.route('/api/v1/communities/:idOrSlug/bans/:userId').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/communities/:idOrSlug/bans/:userId')
  assertNotSuspended(currentUser)

  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const userId = validateUUIDParam(ctx, 'userId')

  const community = await getCommunityOrThrow(idOrSlug)
  const membership = await getCommunityMember(community.id, currentUser.id)

  ctx.assert(
    currentUserCanManageCommunityBans(currentUser, community, membership),
    403,
    'Forbidden',
  )
  validateRequestContract(ctx, 'DELETE:/api/v1/communities/:idOrSlug/bans/:userId', {
    path: ctx.params,
  })

  await liftCommunityBan(currentUser, community.id, userId)

  ctx.setStatus(204)
})
