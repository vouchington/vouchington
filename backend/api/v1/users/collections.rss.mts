import app from '../../app.mts'
import { apiQuery } from '../../response-contract.mts'
import type { Context } from '@jongleberry/api-server'
import { defineQueryContract, queryEnum } from '@modules/pagination'
import { getUserRssFeedsCollection, getUserRssFeedItemsCollection } from '@services/entity-fetch'
import { buildRssFeedSidecars, proxyRssFeedCoverArt } from '@services/rss-feeds'
import { getRssFeedItemEmbedsByItems, proxyThumbnailUrls } from '@services/rss-feed-items'
import { proxyRssFeedItemCoverArt } from '@services/rss-feed-items/proxy-cover-art'
import { isAdminUser } from '@services/users'
import { getOptionalAuthAndRateLimit } from '../../response-helpers.mts'
import { parseAndValidatePaginatedRequest } from '../../validate-paginated-query.mts'
import {
  RSS_FEED_ITEM_LIST_TYPES,
  RSS_FEED_LIST_TYPES,
  getCollectionRouteConfig,
  relationCollectionPaginationParser,
  rssFeedsPaginationParser,
} from './collection-route-config.mts'
import {
  applyCacheHeaders,
  assertSetValue,
  parseFeedType,
  parseMediaType,
  resolveTargetUser,
} from './collection-route-helpers.mts'

const rssFeedsRouteQueryContract = defineQueryContract({
  feed_type: queryEnum(['article', 'podcast', 'video', 'mixed'] as const),
})

const rssFeedItemsRouteQueryContract = defineQueryContract({
  media_type: queryEnum(['article', 'audio', 'video'] as const),
})

app.route('/api/v1/users/:idOrSlug/rss-feeds/:listType').get(async (ctx: Context) => {
  apiQuery(
    'GET:/api/v1/users/:idOrSlug/rss-feeds/:listType',
    rssFeedsPaginationParser,
    rssFeedsRouteQueryContract,
  )
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

  const feedType = parseFeedType(ctx.query.feed_type)
  const { limit, after } = parseAndValidatePaginatedRequest(
    ctx,
    'GET:/api/v1/users/:idOrSlug/rss-feeds/:listType',
    rssFeedsPaginationParser,
    { path: true, extraQueryContracts: [rssFeedsRouteQueryContract.queryContract] },
  )

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

  const mediaType = parseMediaType(ctx.query.media_type)
  const { limit, after } = parseAndValidatePaginatedRequest(
    ctx,
    'GET:/api/v1/users/:idOrSlug/rss-feed-items/:listType',
    relationCollectionPaginationParser,
    { path: true, extraQueryContracts: [rssFeedItemsRouteQueryContract.queryContract] },
  )
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
