import type { Context } from '@jongleberry/api-server'
import { clampAnonLimit } from '@modules/search-utils'
import app from '../../app.mts'
import { apiQuery } from '../../response-contract.mts'
import { getUserTopicsCollectionPage } from '@services/entity-fetch'
import { getOptionalAuthAndRateLimit } from '../../response-helpers.mts'
import {
  TOPIC_LIST_TYPES,
  TOPIC_SERVICE_LIST_TYPES,
  getCollectionRouteConfig,
  relationCollectionPaginationParser,
} from './collection-route-config.mts'
import {
  applyCacheHeaders,
  assertSetValue,
  resolveTargetUser,
} from './collection-route-helpers.mts'

app.route('/api/v1/users/:idOrSlug/topics/:listType').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/users/:idOrSlug/topics/:listType', relationCollectionPaginationParser)
  await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/users/:idOrSlug/topics/:listType')
  const listType = assertSetValue(ctx.params.listType, TOPIC_LIST_TYPES, 'Invalid topic list type')
  const routeConfig = getCollectionRouteConfig('topics', listType)
  const resolved = await resolveTargetUser(ctx, {
    privateCollection: routeConfig.access === 'owner',
    visibilityField: routeConfig.visibilityField,
  })
  const serviceListType = TOPIC_SERVICE_LIST_TYPES[listType]
  const pagination = relationCollectionPaginationParser.parse(ctx.query)
  if (!resolved.currentUser) pagination.limit = clampAnonLimit(pagination.limit)
  const topics = await getUserTopicsCollectionPage(resolved.target.id, serviceListType, pagination)
  applyCacheHeaders(ctx, !resolved.privateCollection, resolved.currentUser)
  ctx.json(topics)
})
