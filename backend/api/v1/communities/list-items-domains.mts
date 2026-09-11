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
import { getUrlHostnamesByAnyBatch } from '@services/urls-hostnames'
import { indexById } from '@modules/utils'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

app
  .route('/api/v1/communities/:idOrSlug/list-items/domains')
  .get(async (ctx: Context) => {
    const currentUser = await getOptionalAuthAndRateLimit(
      ctx,
      'GET:/api/v1/communities/:idOrSlug/list-items/domains',
    )

    const { idOrSlug } = ctx.params as { idOrSlug: string }
    const { community } = await loadCommunityForViewer(currentUser, idOrSlug)

    const limit = ctx.query.limit ? Number(ctx.query.limit) : undefined
    const after = ctx.query.after as string | undefined

    const result = await searchCommunityListItems(community.id, 'url_hostname', { limit, after })
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
      url_hostnames: getUrlHostnamesByAnyBatch(entityIds).then(hostnames =>
        hostnames.reduce<Record<string, unknown>>((acc, hostname) => {
          if (hostname) acc[hostname.id] = hostname
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
      'POST:/api/v1/communities/:idOrSlug/list-items/domains',
    )

    const { idOrSlug } = ctx.params as { idOrSlug: string }
    const community = await getCommunityOrThrow(idOrSlug)
    const membership = await getCommunityMember(community.id, currentUser.id)
    ctx.assert(
      currentUserCanManageCommunityList(currentUser, community, membership),
      403,
      'Forbidden',
    )

    const body = (await ctx.request.json('1mb')) as { url_hostname_id: string }
    ctx.assert(body.url_hostname_id, 422, 'url_hostname_id is required')

    const item = await addCommunityListItem(
      currentUser.id,
      community.id,
      'url_hostname',
      body.url_hostname_id,
    )

    ctx.setStatus(201)
    ctx.json({ community_list_item: item })
  })

app
  .route('/api/v1/communities/:idOrSlug/list-items/domains/:itemId')
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'DELETE:/api/v1/communities/:idOrSlug/list-items/domains/:itemId',
    )

    const { idOrSlug, itemId } = ctx.params as { idOrSlug: string; itemId: string }
    const community = await getCommunityOrThrow(idOrSlug)
    const membership = await getCommunityMember(community.id, currentUser.id)
    ctx.assert(
      currentUserCanManageCommunityList(currentUser, community, membership),
      403,
      'Forbidden',
    )

    await removeCommunityListItem(currentUser.id, community.id, itemId, 'url_hostname')

    ctx.setStatus(204)
  })
