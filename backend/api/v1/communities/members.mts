import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import {
  getOptionalAuthAndRateLimit,
  requireAuth,
  validateRequestContract,
} from '../../response-helpers.mts'
import {
  getCommunityOrThrow,
  loadCommunityForViewer,
  searchCommunityMembers,
  joinCommunity,
  leaveCommunity,
  updateMemberRole,
  removeMember,
  initiateOwnershipTransfer,
  type CommunityMemberRole,
} from '@services/communities'
import { getUserPublicByAnyCachedBatch } from '@services/entity-fetch'
import { indexById, isUUID } from '@modules/utils'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

app
  .route('/api/v1/communities/:idOrSlug/members')
  .get(async (ctx: Context) => {
    const currentUser = await getOptionalAuthAndRateLimit(
      ctx,
      'GET:/api/v1/communities/:idOrSlug/members',
    )
    const { idOrSlug } = ctx.params as { idOrSlug: string }

    const { community, membership } = await loadCommunityForViewer(currentUser, idOrSlug)
    validateRequestContract(ctx, 'GET:/api/v1/communities/:idOrSlug/members', {
      path: ctx.params,
    })

    const limit = ctx.query.limit ? Number(ctx.query.limit) : undefined
    const after = ctx.query.after as string | undefined
    const role = ctx.query.role as CommunityMemberRole | undefined

    const result = await searchCommunityMembers(community.id, {
      after,
      currentUser,
      limit,
      role,
      viewerMembership: membership,
      rosterVisibility: community.member_roster_visibility,
    })
    const userIds = result.results.map(m => m.user_id)

    if (!currentUser) {
      ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
    }

    const searchResults = result.results.map(m => ({
      __entity_type: 'community_member' as const,
      id: m.id,
    }))
    const membersMap = indexById(result.results)

    const output: Record<string, unknown> = {
      results: searchResults,
      page_info: result.page_info,
      community_members: membersMap,
      users: getUserPublicByAnyCachedBatch(userIds).then(users =>
        users.reduce<Record<string, unknown>>((acc, user) => {
          if (user) acc[user.id] = user
          return acc
        }, {}),
      ),
    }

    ctx.setType('json')
    await ctx.pipeline(streamJsonObject(output))
  })
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'POST:/api/v1/communities/:idOrSlug/members')

    const { idOrSlug } = ctx.params as { idOrSlug: string }
    const community = await getCommunityOrThrow(idOrSlug)
    validateRequestContract(ctx, 'POST:/api/v1/communities/:idOrSlug/members', {
      path: ctx.params,
    })

    await joinCommunity(currentUser.id, community.id)

    ctx.setStatus(201)
    ctx.json({})
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/communities/:idOrSlug/members')

    const { idOrSlug } = ctx.params as { idOrSlug: string }
    const community = await getCommunityOrThrow(idOrSlug)
    validateRequestContract(ctx, 'DELETE:/api/v1/communities/:idOrSlug/members', {
      path: ctx.params,
    })

    await leaveCommunity(currentUser.id, community.id)

    ctx.setStatus(204)
  })

app
  .route('/api/v1/communities/:idOrSlug/members/:userId')
  .patch(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'PATCH:/api/v1/communities/:idOrSlug/members/:userId',
    )

    const { idOrSlug, userId } = ctx.params as { idOrSlug: string; userId: string }
    const community = await getCommunityOrThrow(idOrSlug)

    const body = (await ctx.request.json('1mb')) as { role: CommunityMemberRole }
    validateRequestContract(ctx, 'PATCH:/api/v1/communities/:idOrSlug/members/:userId', {
      path: ctx.params,
      body,
    })

    await updateMemberRole(currentUser.id, community.id, userId, body.role)

    ctx.setStatus(204)
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'DELETE:/api/v1/communities/:idOrSlug/members/:userId',
    )

    const { idOrSlug, userId } = ctx.params as { idOrSlug: string; userId: string }
    const community = await getCommunityOrThrow(idOrSlug)
    validateRequestContract(ctx, 'DELETE:/api/v1/communities/:idOrSlug/members/:userId', {
      path: ctx.params,
    })

    await removeMember(currentUser.id, community.id, userId)

    ctx.setStatus(204)
  })

app.route('/api/v1/communities/:idOrSlug/ownership-transfers').post(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'POST:/api/v1/communities/:idOrSlug/ownership-transfers',
  )

  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const community = await getCommunityOrThrow(idOrSlug)

  const body = (await ctx.request.json('1mb')) as { user_id: string }
  validateRequestContract(ctx, 'POST:/api/v1/communities/:idOrSlug/ownership-transfers', {
    path: ctx.params,
    body,
  })
  ctx.assert(body.user_id, 422, 'user_id is required')
  ctx.assert(isUUID(body.user_id), 422, 'user_id must be a valid UUID')

  await initiateOwnershipTransfer(currentUser.id, community.id, body.user_id)

  ctx.setStatus(204)
})
