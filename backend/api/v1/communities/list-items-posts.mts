import app from '../../app.mts'
import { apiQuery } from '../../response-contract.mts'
import { buildCommunityListItemsOutput } from './list-items-output.mts'
import { communityPageQuery, communityPageQueryInput } from './query-contracts-helpers.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import {
  getOptionalAuthAndRateLimit,
  requireAuth,
  validateRequestContract,
} from '../../response-helpers.mts'
import {
  getCommunityOrThrow,
  loadCommunityForViewer,
  getCommunityMember,
  currentUserCanManageCommunityList,
  searchCommunityListItems,
  addCommunityListItem,
  removeCommunityListItem,
} from '@services/communities'
import { attachPostProvenance } from '@services/content-provenance'
import { getPostByAnyCachedBatch, getPostMetricsByAnyCachedBatch } from '@services/entity-fetch'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

app
  .route('/api/v1/communities/:idOrSlug/list-items/posts')
  .get(async (ctx: Context) => {
    apiQuery('GET:/api/v1/communities/:idOrSlug/list-items/posts', communityPageQuery)
    const currentUser = await getOptionalAuthAndRateLimit(
      ctx,
      'GET:/api/v1/communities/:idOrSlug/list-items/posts',
    )

    const { idOrSlug } = ctx.params as { idOrSlug: string }
    const { community } = await loadCommunityForViewer(currentUser, idOrSlug)
    validateRequestContract(ctx, 'GET:/api/v1/communities/:idOrSlug/list-items/posts', {
      path: ctx.params,
    })

    const limit = ctx.query.limit ? Number(ctx.query.limit) : undefined
    const after = ctx.query.after as string | undefined
    validateRequestContract(ctx, 'GET:/api/v1/communities/:idOrSlug/list-items/posts', {
      query: communityPageQueryInput(ctx.query),
    })

    const result = await searchCommunityListItems(community.id, 'post', {
      limit,
      after,
      currentUser,
    })

    if (!currentUser) {
      ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
    }

    const output = buildCommunityListItemsOutput(result, {
      name: 'posts',
      getEntities: ids =>
        getPostByAnyCachedBatch(ids).then(posts => attachPostProvenance(posts, currentUser)),
      getMetrics: getPostMetricsByAnyCachedBatch,
    })

    ctx.setType('json')
    await ctx.pipeline(streamJsonObject(output))
  })
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'POST:/api/v1/communities/:idOrSlug/list-items/posts',
    )

    const { idOrSlug } = ctx.params as { idOrSlug: string }
    const community = await getCommunityOrThrow(idOrSlug)
    const membership = await getCommunityMember(community.id, currentUser.id)
    ctx.assert(
      currentUserCanManageCommunityList(currentUser, community, membership),
      403,
      'Forbidden',
    )

    const body = (await ctx.request.json('1mb')) as { post_id: string }
    validateRequestContract(ctx, 'POST:/api/v1/communities/:idOrSlug/list-items/posts', {
      path: ctx.params,
      body,
    })
    ctx.assert(body.post_id, 422, 'post_id is required')

    const item = await addCommunityListItem(currentUser.id, community.id, 'post', body.post_id)

    ctx.setStatus(201)
    ctx.json({ community_list_item: item })
  })

app.route('/api/v1/communities/:idOrSlug/list-items/posts/:itemId').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'DELETE:/api/v1/communities/:idOrSlug/list-items/posts/:itemId',
  )

  const { idOrSlug, itemId } = ctx.params as { idOrSlug: string; itemId: string }
  const community = await getCommunityOrThrow(idOrSlug)
  const membership = await getCommunityMember(community.id, currentUser.id)
  ctx.assert(
    currentUserCanManageCommunityList(currentUser, community, membership),
    403,
    'Forbidden',
  )
  validateRequestContract(ctx, 'DELETE:/api/v1/communities/:idOrSlug/list-items/posts/:itemId', {
    path: ctx.params,
  })

  await removeCommunityListItem(currentUser.id, community.id, itemId, 'post')

  ctx.setStatus(204)
})
