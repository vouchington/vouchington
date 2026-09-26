import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getRssFeedByIdCached } from '@services/entity-fetch'
import { proxyRssFeedCoverArt } from '@services/rss-feeds/proxy-cover-art'
import { readOptionalUnreliableStatusCodes } from '@modules/rss-unreliable-status-codes'
import type { ViewRssFeed } from '@services/rss-feeds/types'
import {
  updateRssFeedWithStateAsCurrentUser,
  hardDeleteRssFeedByIdAsCurrentUser,
} from '@services/rss-feeds'
import {
  currentUserCanUpdateRssFeed,
  currentUserCanDeleteRssFeed,
  currentUserCanRefreshRssFeed,
  currentUserCanViewLatestRssFeedCrawl,
} from '@services/rss-feeds/authorization'
import { assertNotSuspended, isAdminUser } from '@services/users'
import type { UpdateRssFeedChanges } from '@services/rss-feeds/update'
import {
  searchRssFeedCrawls,
  getRssFeedCrawlById,
  getRssFeedCrawlSummaryById,
  toPaidSafeRssFeedCrawl,
} from '@services/rss-feeds/crawls'
import { getMembershipByUserId } from '@services/memberships'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'
import {
  getOptionalAuthAndRateLimit,
  setAnonymousPublicCacheHeaders,
  requireAuthAndRateLimit,
  requireAuth,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import { parseUpdateRssFeedBody } from '@services/rss-feeds/request-body'
import { createPaginationParser } from '@modules/pagination'
import { apiQuery, apiRequestContract, apiResponse } from '../../response-contract.mts'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'

const rssFeedCrawlsParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 50 },
})
type UpdateRssFeedBody = {
  rss_feed_url?: string
  topic_id?: string
  title?: string | null
  enabled?: boolean
  discoverable?: boolean
  reason?: string
  ignore_robots_txt?: boolean | null
  unreliable_status_codes?: number[] | null
}
app
  .route('/api/v1/rss-feeds/:id')
  .get(async (ctx: Context) => {
    const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/rss-feeds/:id')
    validateRequestContract(ctx, 'GET:/api/v1/rss-feeds/:id', { path: ctx.params })
    const id = validateUUIDParam(ctx, 'id')
    const rawFeed = await getRssFeedByIdCached(id)
    ctx.assert(rawFeed, 404, 'RSS feed not found')
    const rssFeed = proxyRssFeedCoverArt(rawFeed as ViewRssFeed)
    setAnonymousPublicCacheHeaders(ctx, currentUser, HTTP_CACHE_LONG_MAX_AGE_SECONDS)

    const membership =
      currentUser && !currentUserCanRefreshRssFeed(currentUser)
        ? await getMembershipByUserId(currentUser.id)
        : null
    const canViewLatestCrawl = currentUserCanViewLatestRssFeedCrawl(currentUser, membership)
    let latestCrawl = null
    if (canViewLatestCrawl) {
      const crawls = await searchRssFeedCrawls(rssFeed.id, { limit: 1 })
      latestCrawl = crawls.results[0] ?? null
    }

    ctx.json({
      rss_feed: rssFeed,
      latest_crawl: latestCrawl,
      can_view_latest_crawl: canViewLatestCrawl,
    })
  })
  .patch(async (ctx: Context) => {
    apiRequestContract<'PATCH:/api/v1/rss-feeds/:id', UpdateRssFeedBody>(
      'PATCH:/api/v1/rss-feeds/:id',
    )
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanUpdateRssFeed,
      'PATCH:/api/v1/rss-feeds/:id',
    )
    assertNotSuspended(currentUser)
    validateRequestContract(ctx, 'PATCH:/api/v1/rss-feeds/:id', { path: ctx.params })
    const id = validateUUIDParam(ctx, 'id')
    const rssFeed = await getRssFeedByIdCached(id)
    ctx.assert(rssFeed, 404, 'RSS feed not found')
    const rawBody = (await ctx.request.json('1mb')) as UpdateRssFeedBody
    if (rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)) {
      const bodyRecord = rawBody as Record<string, unknown>
      if ('ignore_robots_txt' in bodyRecord || 'unreliable_status_codes' in bodyRecord) {
        ctx.assert(isAdminUser(currentUser), 403, 'Unauthorized')
      }
    }
    validateRequestContract(ctx, 'PATCH:/api/v1/rss-feeds/:id', { body: rawBody })
    const { enabled, discoverable, reason, ...changes } = parseUpdateRssFeedBody(rawBody)

    // Admin-only operator field: ignore_robots_txt
    const bodyRecord = rawBody as Record<string, unknown>
    if ('ignore_robots_txt' in bodyRecord) {
      ctx.assert(isAdminUser(currentUser), 403, 'Unauthorized')
      const raw = bodyRecord.ignore_robots_txt
      ctx.assert(
        raw === null || typeof raw === 'boolean',
        400,
        'ignore_robots_txt must be a boolean or null',
      )
      ;(changes as UpdateRssFeedChanges).ignore_robots_txt = raw as boolean | null
    }
    if ('unreliable_status_codes' in bodyRecord) {
      ctx.assert(isAdminUser(currentUser), 403, 'Unauthorized')
      ;(changes as UpdateRssFeedChanges).unreliable_status_codes =
        readOptionalUnreliableStatusCodes(
          bodyRecord.unreliable_status_codes,
          'unreliable_status_codes',
        )
    }
    await updateRssFeedWithStateAsCurrentUser(currentUser, rssFeed.id, changes, {
      enabled,
      discoverable,
      reason,
    })
    const updated = await getRssFeedByIdCached(rssFeed.id)
    ctx.assert(updated, 404, 'RSS feed not found')
    ctx.json({ rss_feed: proxyRssFeedCoverArt(updated as ViewRssFeed) })
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanDeleteRssFeed,
      'DELETE:/api/v1/rss-feeds/:id',
    )
    assertNotSuspended(currentUser)
    validateRequestContract(ctx, 'DELETE:/api/v1/rss-feeds/:id', { path: ctx.params })
    const id = validateUUIDParam(ctx, 'id')
    const rssFeed = await getRssFeedByIdCached(id)
    ctx.assert(rssFeed, 404, 'RSS feed not found')
    await hardDeleteRssFeedByIdAsCurrentUser(currentUser, rssFeed.id)
    ctx.setStatus(204)
  })
app.route('/api/v1/rss-feeds/:id/crawls').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/rss-feeds/:id/crawls', rssFeedCrawlsParser)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/rss-feeds/:id/crawls')
  const membership = currentUserCanRefreshRssFeed(currentUser)
    ? null
    : await getMembershipByUserId(currentUser.id)
  if (!currentUserCanViewLatestRssFeedCrawl(currentUser, membership)) {
    return ctx.throw(403, 'Premium membership required')
  }
  validateRequestContract(ctx, 'GET:/api/v1/rss-feeds/:id/crawls', { path: ctx.params })
  const id = validateUUIDParam(ctx, 'id')
  const rssFeed = await getRssFeedByIdCached(id)
  ctx.assert(rssFeed, 404, 'RSS feed not found')

  const options = rssFeedCrawlsParser.parse(ctx.query)
  const query = prepareQueryForValidation(ctx.query, rssFeedCrawlsParser.queryContract)
  if (options.after !== undefined) query.after = options.after
  if (ctx.query.limit !== undefined) query.limit = options.limit
  validateRequestContract(ctx, 'GET:/api/v1/rss-feeds/:id/crawls', { query })
  const crawls = await searchRssFeedCrawls(rssFeed.id, options)
  ctx.json(apiResponse('GET:/api/v1/rss-feeds/:id/crawls', crawls))
})

app.route('/api/v1/rss-feeds/:id/crawls/:crawlId').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/rss-feeds/:id/crawls/:crawlId')
  const membership = currentUserCanRefreshRssFeed(currentUser)
    ? null
    : await getMembershipByUserId(currentUser.id)
  if (!currentUserCanViewLatestRssFeedCrawl(currentUser, membership)) {
    return ctx.throw(403, 'Premium membership required')
  }
  validateRequestContract(ctx, 'GET:/api/v1/rss-feeds/:id/crawls/:crawlId', { path: ctx.params })
  validateUUIDParam(ctx, 'id')
  validateUUIDParam(ctx, 'crawlId')

  const rssFeed = await getRssFeedByIdCached(ctx.params.id!)
  ctx.assert(rssFeed, 404, 'RSS feed not found')
  if (currentUserCanRefreshRssFeed(currentUser)) {
    const crawl = await getRssFeedCrawlById(rssFeed.id, ctx.params.crawlId!)
    ctx.assert(crawl, 404, 'Crawl not found')
    ctx.json(apiResponse('GET:/api/v1/rss-feeds/:id/crawls/:crawlId#privileged', { crawl }))
    return
  }
  const crawl = await getRssFeedCrawlSummaryById(rssFeed.id, ctx.params.crawlId!)
  ctx.assert(crawl, 404, 'Crawl not found')

  ctx.json(
    apiResponse('GET:/api/v1/rss-feeds/:id/crawls/:crawlId#paid', {
      crawl: toPaidSafeRssFeedCrawl(crawl),
    }),
  )
})
