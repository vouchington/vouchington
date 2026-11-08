import app from '../../app.mts'
import { apiQuery } from '../../api-query-contract.mts'
import { communityPageQuery, communityPageQueryInput } from './query-contracts-helpers.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract, validateUUIDParam } from '../../response-helpers.mts'
import {
  currentUserCanManageCommunityBans,
  liftCommunityBan,
  liftAllCommunityBans,
  listActiveCommunityBans,
  getCommunityBanDetail,
  loadCommunityWithViewer,
} from '@services/communities'
import { assertNotSuspended } from '@services/users'
import { getUserPublicByAnyCachedBatch } from '@services/entity-fetch'

app
  .route('/api/v1/communities/:idOrSlug/bans/users/:userId')
  .get(async (ctx: Context) => {
    apiQuery('GET:/api/v1/communities/:idOrSlug/bans/users/:userId', communityPageQuery)
    const currentUser = await requireAuth(
      ctx,
      'GET:/api/v1/communities/:idOrSlug/bans/users/:userId',
    )
    const { idOrSlug } = ctx.params as { idOrSlug: string }
    const userId = validateUUIDParam(ctx, 'userId')
    const { community, membership } = await loadCommunityWithViewer(idOrSlug, currentUser.id)
    ctx.assert(
      currentUserCanManageCommunityBans(currentUser, community, membership),
      403,
      'Forbidden',
    )
    validateRequestContract(ctx, 'GET:/api/v1/communities/:idOrSlug/bans/users/:userId', {
      path: ctx.params,
      query: communityPageQueryInput(ctx.query),
    })
    const result = await listActiveCommunityBans(community.id, userId, {
      limit: ctx.query.limit ? Number(ctx.query.limit) : undefined,
      after: ctx.query.after as string | undefined,
    })
    const users = await getUserPublicByAnyCachedBatch(result.results.map(b => b.user_id))
    ctx.json({
      results: result.results.map(b => ({ __entity_type: 'community_ban' as const, id: b.id })),
      page_info: result.page_info,
      community_bans: Object.fromEntries(result.results.map(b => [b.id, b])),
      users: Object.fromEntries(users.filter(user => user != null).map(user => [user.id, user])),
    })
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'DELETE:/api/v1/communities/:idOrSlug/bans/users/:userId',
    )
    assertNotSuspended(currentUser)
    const { idOrSlug } = ctx.params as { idOrSlug: string }
    const userId = validateUUIDParam(ctx, 'userId')
    const { community, membership } = await loadCommunityWithViewer(idOrSlug, currentUser.id)
    ctx.assert(
      currentUserCanManageCommunityBans(currentUser, community, membership),
      403,
      'Forbidden',
    )
    validateRequestContract(ctx, 'DELETE:/api/v1/communities/:idOrSlug/bans/users/:userId', {
      path: ctx.params,
    })
    ctx.json(await liftAllCommunityBans(currentUser, community.id, userId))
  })

app
  .route('/api/v1/communities/:idOrSlug/bans/:banId')
  .get(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'GET:/api/v1/communities/:idOrSlug/bans/:banId')
    const { idOrSlug } = ctx.params as { idOrSlug: string }
    const banId = validateUUIDParam(ctx, 'banId')
    const { community, membership } = await loadCommunityWithViewer(idOrSlug, currentUser.id)
    ctx.assert(
      currentUserCanManageCommunityBans(currentUser, community, membership),
      403,
      'Forbidden',
    )
    validateRequestContract(ctx, 'GET:/api/v1/communities/:idOrSlug/bans/:banId', {
      path: ctx.params,
    })
    const ban = await getCommunityBanDetail(community.id, banId)
    ctx.assert(ban, 404, 'Ban not found')
    const { case_id: _, ...community_ban } = ban
    ctx.json({ community_ban })
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/communities/:idOrSlug/bans/:banId')
    assertNotSuspended(currentUser)
    const { idOrSlug } = ctx.params as { idOrSlug: string }
    const banId = validateUUIDParam(ctx, 'banId')
    const { community, membership } = await loadCommunityWithViewer(idOrSlug, currentUser.id)
    ctx.assert(
      currentUserCanManageCommunityBans(currentUser, community, membership),
      403,
      'Forbidden',
    )
    validateRequestContract(ctx, 'DELETE:/api/v1/communities/:idOrSlug/bans/:banId', {
      path: ctx.params,
    })
    ctx.json(await liftCommunityBan(currentUser, community.id, banId))
  })
