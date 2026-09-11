import app from '../../app.mts'
import { apiQuery } from '../../response-contract.mts'
import type { Context } from '@jongleberry/api-server'
import { defineQueryContract, queryEnum, queryString } from '@modules/pagination'
import { getUserUsersCollection, isAdminUser } from '@services/users'
import {
  getUserHostnamesCollection,
  getUserPostsCollection,
  getUserUrlsCollection,
  getUserRssFeedsCollection,
  getUserRssFeedItemsCollection,
} from '@services/entity-fetch'
import { getBookmarksForEntities } from '@services/bookmarks'
import { buildRssFeedSidecars, proxyRssFeedCoverArt } from '@services/rss-feeds'
import { getRssFeedItemEmbedsByItems, proxyThumbnailUrls } from '@services/rss-feed-items'
import { proxyRssFeedItemCoverArt } from '@services/rss-feed-items/proxy-cover-art'
import { getOptionalAuthAndRateLimit } from '../../response-helpers.mts'
import {
  HOSTNAME_LIST_TYPES,
  POST_LIST_TYPES,
  PRIVATE_USER_LIST_TYPES,
  RSS_FEED_ITEM_LIST_TYPES,
  RSS_FEED_LIST_TYPES,
  URL_LIST_TYPES,
  USER_LIST_TYPES,
  USER_SERVICE_LIST_TYPES,
  getCollectionRouteConfig,
  postsPaginationParser,
  relationCollectionPaginationParser,
  rssFeedsPaginationParser,
  usersPaginationParser,
} from './collection-route-config.mts'
import {
  applyCacheHeaders,
  assertSetValue,
  parseFeedType,
  parseMediaType,
  resolveTargetUser,
} from './collection-route-helpers.mts'

const rssFeedItemsRouteQueryContract = defineQueryContract({
  media_type: queryEnum(['article', 'audio', 'video'] as const),
})

const usersSearchRouteQueryContract = defineQueryContract({
  q: queryString({ description: 'Search the collection by username prefix' }),
})

app.route('/api/v1/users/:idOrSlug/posts/:listType').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/users/:idOrSlug/posts/:listType', postsPaginationParser)
  await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/users/:idOrSlug/posts/:listType')
  const listType = assertSetValue(ctx.params.listType, POST_LIST_TYPES, 'Invalid post list type')
  const resolved = await resolveTargetUser(ctx, { privateCollection: true })

  const { limit, after } = postsPaginationParser.parse(ctx.query)
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

  const { limit, after } = usersPaginationParser.parse(ctx.query)
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
    ? Object.fromEntries(users.map(u => [u.id, muteBookmarks[u.id]?.mute === true]))
    : undefined

  applyCacheHeaders(ctx, !resolved.privateCollection, resolved.currentUser)
  ctx.json({ ...collection, ...(muted ? { muted } : {}) })
})

app.route('/api/v1/users/:idOrSlug/rss-feeds/:listType').get(async (ctx: Context) => {
  await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/users/:idOrSlug/rss-feeds/:listType')
  const listType = assertSetValue(
    ctx.params.listType,
    RSS_FEED_LIST_TYPES,
    'Invalid RSS feed list type',
  )
  /* c8 ignore next 2 -- covered by focused RSS feed collection tests outside pre-push's dependency sample. */
  const routeConfig = getCollectionRouteConfig('rss-feeds', listType)
  const isPrivate = routeConfig.access === 'owner'
  const resolved = await resolveTargetUser(ctx, {
    privateCollection: isPrivate,
    visibilityField: routeConfig.visibilityField,
  })

  const { limit, after } = rssFeedsPaginationParser.parse(ctx.query)
  const feedType = parseFeedType(ctx.query.feed_type)

  const collection = await getUserRssFeedsCollection(resolved.target.id, listType, {
    limit,
    after,
    feedType,
  })
  const proxiedResults = collection.results.map(proxyRssFeedCoverArt)
  const sidecars = await buildRssFeedSidecars(proxiedResults, resolved.currentUser)
  applyCacheHeaders(ctx, !isPrivate, resolved.currentUser)
  ctx.json({ ...collection, results: proxiedResults, ...sidecars })
})

app.route('/api/v1/users/:idOrSlug/rss-feed-items/:listType').get(async (ctx: Context) => {
  apiQuery(
    'GET:/api/v1/users/:idOrSlug/rss-feed-items/:listType',
    relationCollectionPaginationParser,
    rssFeedItemsRouteQueryContract,
  )
  await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/users/:idOrSlug/rss-feed-items/:listType')
  const listType = assertSetValue(
    ctx.params.listType,
    RSS_FEED_ITEM_LIST_TYPES,
    'Invalid RSS feed item list type',
  )
  const resolved = await resolveTargetUser(ctx, { privateCollection: true })

  const { limit, after } = relationCollectionPaginationParser.parse(ctx.query)
  const mediaType = parseMediaType(ctx.query.media_type)
  const collection = await getUserRssFeedItemsCollection(resolved.target.id, listType, {
    limit,
    after,
    mediaType,
  })
  const proxiedResults = collection.results.map(proxyRssFeedItemCoverArt)

  ctx.json({
    ...collection,
    results: proxiedResults,
    rss_feed_item_thumbnail_url: proxyThumbnailUrls(proxiedResults),
    rss_feed_item_embeds: await getRssFeedItemEmbedsByItems(
      proxiedResults,
      {},
      isAdminUser(resolved.currentUser) ? 'administrator' : 'public',
    ),
  })
})

app.route('/api/v1/users/:idOrSlug/urls/:listType').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/users/:idOrSlug/urls/:listType', relationCollectionPaginationParser)
  await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/users/:idOrSlug/urls/:listType')
  const listType = assertSetValue(ctx.params.listType, URL_LIST_TYPES, 'Invalid URL list type')
  const resolved = await resolveTargetUser(ctx, { privateCollection: true })

  const pagination = relationCollectionPaginationParser.parse(ctx.query)
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

  const pagination = relationCollectionPaginationParser.parse(ctx.query)
  const hostnames = await getUserHostnamesCollection(resolved.target.id, listType, pagination)

  ctx.json(hostnames)
})
