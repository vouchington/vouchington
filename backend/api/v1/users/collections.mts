import app from '../../app.mts'
import { apiQuery } from '../../response-contract.mts'
import type { Context } from '@jongleberry/api-server'
import { defineQueryContract, queryString } from '@modules/pagination'
import { getUserUsersCollection } from '@services/users'
import {
  getUserHostnamesCollection,
  getUserPostsCollection,
  getUserUrlsCollection,
} from '@services/entity-fetch'
import { getBookmarksForEntities } from '@services/bookmarks'
import { getOptionalAuthAndRateLimit } from '../../response-helpers.mts'
import { parseAndValidatePaginatedRequest } from '../../validate-paginated-query.mts'
import {
  HOSTNAME_LIST_TYPES,
  POST_LIST_TYPES,
  PRIVATE_USER_LIST_TYPES,
  URL_LIST_TYPES,
  USER_LIST_TYPES,
  USER_SERVICE_LIST_TYPES,
  getCollectionRouteConfig,
  postsPaginationParser,
  relationCollectionPaginationParser,
  usersPaginationParser,
} from './collection-route-config.mts'
import {
  applyCacheHeaders,
  assertSetValue,
  resolveTargetUser,
} from './collection-route-helpers.mts'

const usersSearchRouteQueryContract = defineQueryContract({
  q: queryString({ description: 'Search the collection by username prefix' }),
})

app.route('/api/v1/users/:idOrSlug/posts/:listType').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/users/:idOrSlug/posts/:listType', postsPaginationParser)
  await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/users/:idOrSlug/posts/:listType')
  const listType = assertSetValue(ctx.params.listType, POST_LIST_TYPES, 'Invalid post list type')
  const resolved = await resolveTargetUser(ctx, { privateCollection: true })

  const { limit, after } = parseAndValidatePaginatedRequest(
    ctx,
    'GET:/api/v1/users/:idOrSlug/posts/:listType',
    postsPaginationParser,
    { path: true },
  )
  const collection = await getUserPostsCollection(
    resolved.currentUser,
    resolved.target.id,
    listType,
    { limit, after },
  )

  ctx.json(collection)
})

app.route('/api/v1/users/:idOrSlug/users/:listType').get(async (ctx: Context) => {
  apiQuery(
    'GET:/api/v1/users/:idOrSlug/users/:listType',
    usersPaginationParser,
    usersSearchRouteQueryContract,
  )
  await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/users/:idOrSlug/users/:listType')
  const listType = assertSetValue(ctx.params.listType, USER_LIST_TYPES, 'Invalid user list type')
  /* c8 ignore next -- covered by focused users collection route tests; pre-push samples broader API dependents. */
  const routeConfig = getCollectionRouteConfig('users', listType)
  const resolved = await resolveTargetUser(ctx, {
    privateCollection: routeConfig.access === 'owner',
    visibilityField: routeConfig.visibilityField,
  })

  const { limit, after } = parseAndValidatePaginatedRequest(
    ctx,
    'GET:/api/v1/users/:idOrSlug/users/:listType',
    usersPaginationParser,
    { path: true, extraQueryContracts: [usersSearchRouteQueryContract.queryContract] },
  )
  const query = typeof ctx.query.q === 'string' ? ctx.query.q.trim() || undefined : undefined
  const collection = await getUserUsersCollection(
    resolved.target.id,
    USER_SERVICE_LIST_TYPES[listType],
    {
      limit,
      after,
      query,
    },
  )
  const users = collection.results
  const muteBookmarks =
    resolved.currentUser && users.length > 0 && !PRIVATE_USER_LIST_TYPES.has(listType)
      ? await getBookmarksForEntities(resolved.currentUser, 'user', users)
      : null

  const muted: Record<string, boolean> | undefined = muteBookmarks
    ? Object.fromEntries(users.map(u => [u.id, muteBookmarks[u.id]?.mute ?? false]))
    : undefined

  applyCacheHeaders(ctx, !resolved.privateCollection, resolved.currentUser)
  ctx.json({ ...collection, ...(muted ? { muted } : {}) })
})

app.route('/api/v1/users/:idOrSlug/urls/:listType').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/users/:idOrSlug/urls/:listType', relationCollectionPaginationParser)
  await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/users/:idOrSlug/urls/:listType')
  const listType = assertSetValue(ctx.params.listType, URL_LIST_TYPES, 'Invalid URL list type')
  const resolved = await resolveTargetUser(ctx, { privateCollection: true })

  const pagination = parseAndValidatePaginatedRequest(
    ctx,
    'GET:/api/v1/users/:idOrSlug/urls/:listType',
    relationCollectionPaginationParser,
    { path: true },
  )
  const urls = await getUserUrlsCollection(resolved.target.id, listType, pagination)

  ctx.json(urls)
})

app.route('/api/v1/users/:idOrSlug/domains/:listType').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/users/:idOrSlug/domains/:listType', relationCollectionPaginationParser)
  await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/users/:idOrSlug/domains/:listType')
  const listType = assertSetValue(
    ctx.params.listType,
    HOSTNAME_LIST_TYPES,
    'Invalid domain list type',
  )
  const resolved = await resolveTargetUser(ctx, { privateCollection: true })

  const pagination = parseAndValidatePaginatedRequest(
    ctx,
    'GET:/api/v1/users/:idOrSlug/domains/:listType',
    relationCollectionPaginationParser,
    { path: true },
  )
  const hostnames = await getUserHostnamesCollection(resolved.target.id, listType, pagination)

  ctx.json(hostnames)
})
