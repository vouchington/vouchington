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
  getCommunityMember,
  currentUserCanManageCommunityList,
  searchCommunityListItems,
  addCommunityListItem,
  removeCommunityListItem,
} from '@services/communities'
import { getPostByAnyCachedBatch, getPostMetricsByAnyCachedBatch } from '@services/entity-fetch'
import { indexById } from '@modules/utils'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

app
  .route('/api/v1/communities/:idOrSlug/list-items/posts')
  .get(async (ctx: Context) => {
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

    const result = await searchCommunityListItems(community.id, 'post', {
      limit,
      after,
      currentUser,
    })
    const entityIds = result.results.map(item => item.entity_id)

    if (!currentUser) {
      ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
    }

    const output: Record<string, unknown> = {
      results: result.results.map(item => ({
        __entity_type: 'community_list_item' as const,
        id: item.id,
      })),
      page_info: result.page_info,
      community_list_items: indexById(result.results),
      posts: getPostByAnyCachedBatch(entityIds).then(posts =>
        posts.reduce<Record<string, unknown>>((acc, post) => {
          if (post) acc[post.id] = post
          return acc
        }, {}),
      ),
      posts_metrics: getPostMetricsByAnyCachedBatch(entityIds).then(metrics =>
        metrics.reduce<Record<string, unknown>>((acc, metric) => {
          if (metric) acc[metric.id] = metric
          return acc
        }, {}),
      ),
    }

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
