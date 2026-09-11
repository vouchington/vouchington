import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { clampAnonLimit } from '@modules/search-utils'
import {
  getUserCommunitiesCollection,
  getUserMemberCommunitiesCollection,
} from '@services/entity-fetch'
import { apiQuery } from '../../response-contract.mts'
import { getOptionalAuthAndRateLimit } from '../../response-helpers.mts'
import {
  COMMUNITY_LIST_TYPES,
  COMMUNITY_SERVICE_LIST_TYPES,
  getCollectionRouteConfig,
  relationCollectionPaginationParser,
} from './collection-route-config.mts'
import {
  applyCacheHeaders,
  assertSetValue,
  resolveTargetUser,
} from './collection-route-helpers.mts'

app.route('/api/v1/users/:idOrSlug/communities/:listType').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/users/:idOrSlug/communities/:listType', relationCollectionPaginationParser)
  await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/users/:idOrSlug/communities/:listType')
  const listType = assertSetValue(
    ctx.params.listType,
    COMMUNITY_LIST_TYPES,
    'Invalid community list type',
  )
  /* c8 ignore next -- covered by focused users collection route tests; pre-push samples broader API dependents. */
  const routeConfig = getCollectionRouteConfig('communities', listType)
  const resolved = await resolveTargetUser(ctx, {
    privateCollection: routeConfig.access === 'owner',
    visibilityField: routeConfig.visibilityField,
  })

  const serviceListType = COMMUNITY_SERVICE_LIST_TYPES[listType]
  const pagination = relationCollectionPaginationParser.parse(ctx.query)
  if (!resolved.currentUser) pagination.limit = clampAnonLimit(pagination.limit)
  const communities =
    serviceListType === 'member'
      ? await getUserMemberCommunitiesCollection(
          resolved.currentUser,
          resolved.target.id,
          pagination,
        )
      : await getUserCommunitiesCollection(
          resolved.currentUser,
          resolved.target.id,
          serviceListType,
          pagination,
        )

  applyCacheHeaders(ctx, !resolved.privateCollection, resolved.currentUser)
  ctx.json(communities)
})
