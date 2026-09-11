import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { getOptionalAuthAndRateLimit, requireAuth } from '../../response-helpers.mts'
import {
  getCommunityOrThrow,
  loadCommunityForViewer,
  getCommunityMember,
  currentUserCanManageCommunityList,
  searchCommunityListItems,
  addCommunityListItem,
  removeCommunityListItem,
} from '@services/communities'
import { getUrlsByIdBatch } from '@services/urls'
import { indexById } from '@modules/utils'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

app
  .route('/api/v1/communities/:idOrSlug/list-items/urls')
  .get(async (ctx: Context) => {
    const currentUser = await getOptionalAuthAndRateLimit(
      ctx,
      'GET:/api/v1/communities/:idOrSlug/list-items/urls',
    )

    const { idOrSlug } = ctx.params as { idOrSlug: string }
    const { community } = await loadCommunityForViewer(currentUser, idOrSlug)

    const limit = ctx.query.limit ? Number(ctx.query.limit) : undefined
    const after = ctx.query.after as string | undefined

    const result = await searchCommunityListItems(community.id, 'url', { limit, after })
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
      urls: getUrlsByIdBatch(entityIds).then(urls =>
        urls.reduce<Record<string, unknown>>((acc, url) => {
          if (url) acc[url.id] = url
          return acc
        }, {}),
      ),
    }

    ctx.setType('json')
    await ctx.pipeline(streamJsonObject(output))
  })
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'POST:/api/v1/communities/:idOrSlug/list-items/urls')

    const { idOrSlug } = ctx.params as { idOrSlug: string }
    const community = await getCommunityOrThrow(idOrSlug)
    const membership = await getCommunityMember(community.id, currentUser.id)
    ctx.assert(
      currentUserCanManageCommunityList(currentUser, community, membership),
      403,
      'Forbidden',
    )

    const body = (await ctx.request.json('1mb')) as { url_id: string }
    ctx.assert(body.url_id, 422, 'url_id is required')

    const item = await addCommunityListItem(currentUser.id, community.id, 'url', body.url_id)

    ctx.setStatus(201)
    ctx.json({ community_list_item: item })
  })

app.route('/api/v1/communities/:idOrSlug/list-items/urls/:itemId').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'DELETE:/api/v1/communities/:idOrSlug/list-items/urls/:itemId',
  )

  const { idOrSlug, itemId } = ctx.params as { idOrSlug: string; itemId: string }
  const community = await getCommunityOrThrow(idOrSlug)
  const membership = await getCommunityMember(community.id, currentUser.id)
  ctx.assert(
    currentUserCanManageCommunityList(currentUser, community, membership),
    403,
    'Forbidden',
  )

  await removeCommunityListItem(currentUser.id, community.id, itemId, 'url')

  ctx.setStatus(204)
})
