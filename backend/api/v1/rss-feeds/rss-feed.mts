import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  attachRssFeedProvenance,
  attachWrittenRssFeedProvenance,
} from '@services/content-provenance'
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
import { searchRssFeedCrawls } from '@services/rss-feeds/crawls'
import { getMembershipByUserId } from '@services/memberships'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'
import {
  getOptionalAuthAndRateLimit,
  setAnonymousPublicCacheHeaders,
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import { parseUpdateRssFeedBody } from '@services/rss-feeds/request-body'
import { apiRequestContract } from '../../response-contract.mts'
type UpdateRssFeedBody = {
  rss_feed_url?: string
  topic_id?: string
  title?: string | null
  is_enabled?: boolean
  discoverable?: boolean
  reason?: string
  should_ignore_robots_txt?: boolean | null
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
    const [rssFeed] = await attachRssFeedProvenance(
      [proxyRssFeedCoverArt(rawFeed as ViewRssFeed)],
      currentUser,
    )
    ctx.assert(rssFeed, 404, 'RSS feed not found')
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
      if ('should_ignore_robots_txt' in bodyRecord || 'unreliable_status_codes' in bodyRecord) {
        ctx.assert(isAdminUser(currentUser), 403, 'Unauthorized')
      }
    }
    validateRequestContract(ctx, 'PATCH:/api/v1/rss-feeds/:id', { body: rawBody })
    const { is_enabled, discoverable, reason, ...changes } = parseUpdateRssFeedBody(rawBody)

    // Admin-only operator field: should_ignore_robots_txt
    const bodyRecord = rawBody as Record<string, unknown>
    if ('should_ignore_robots_txt' in bodyRecord) {
      ctx.assert(isAdminUser(currentUser), 403, 'Unauthorized')
      const raw = bodyRecord.should_ignore_robots_txt
      ctx.assert(
        raw === null || typeof raw === 'boolean',
        400,
        'should_ignore_robots_txt must be a boolean or null',
      )
      ;(changes as UpdateRssFeedChanges).should_ignore_robots_txt = raw as boolean | null
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
      is_enabled,
      discoverable,
      reason,
    })
    const updated = await getRssFeedByIdCached(rssFeed.id)
    ctx.assert(updated, 404, 'RSS feed not found')
    ctx.json({
      rss_feed: await attachWrittenRssFeedProvenance(
        proxyRssFeedCoverArt(updated as ViewRssFeed),
        currentUser,
      ),
    })
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
