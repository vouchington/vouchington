import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { buildRssFeedSidecars, searchRssFeeds } from '@services/rss-feeds'
import { createSourceFromUrl } from '@services/rss-feeds/create-source'
import { searchRssFeedsCached } from '@services/entity-fetch'
import { assertNotSuspended } from '@services/users'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { parseRssFeedsSearchParams } from '@services/search-params'
import { sendHashtagTopicSearchErrorResponse } from '../hashtag-search-error-response.mts'
import {
  getOptionalAuthAndRateLimit,
  requireAuth,
  setAnonymousPublicCacheHeaders,
} from '../../response-helpers.mts'
import { apiQuery, apiRequest, apiResponse } from '../../response-contract.mts'
import { parseCreateSourceBody } from '@services/rss-feeds/request-body'
import { assertWithinContributionActionLimit } from '@services/contribution-gating/limits'
import { getUserActivePlan } from '@services/memberships'
import { parseBooleanish } from '@ts-shared/utils/query'
import type { ViewRssFeed } from '@services/rss-feeds/types'
import { proxyRssFeedCoverArt } from '@services/rss-feeds/proxy-cover-art'
import {
  buildPageInfo,
  createPaginationParser,
  decodeUuidCursor,
  defineQueryContract,
  isSimpleCursor,
  queryBoolean,
} from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import createHttpError from 'http-errors'

const rssFeedsPaginationParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 25, default: 25 },
})
const rssFeedsRouteQueryContract = defineQueryContract({ apply_mutes: queryBoolean() })

app
  .route('/api/v1/rss-feeds')
  .get(async (ctx: Context) => {
    apiQuery(
      'GET:/api/v1/rss-feeds',
      parseRssFeedsSearchParams,
      rssFeedsPaginationParser,
      rssFeedsRouteQueryContract,
    )
    const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/rss-feeds')
    const parsedSearchParams = await parseRssFeedsSearchParams(ctx.query).catch(error =>
      sendHashtagTopicSearchErrorResponse(ctx, error),
    )
    if (!parsedSearchParams) return
    const { shouldReturnEmpty, searchOptions } = parsedSearchParams

    const { limit, after } = rssFeedsPaginationParser.parse(ctx.query)

    if (after && searchOptions.text_search_query) {
      throw createHttpError(400, 'Cursor pagination is not supported with text_search_query')
    }
    let cursorId: string | undefined
    if (after) {
      const decoded = decodeUuidCursor(after, isSimpleCursor, 'Invalid cursor')
      cursorId = decoded.id
    }

    if (shouldReturnEmpty) {
      setAnonymousPublicCacheHeaders(ctx, currentUser, HTTP_CACHE_SHORT_MAX_AGE_SECONDS)
      ctx.json({
        results: [],
        page_info: {
          has_next_page: false,
          end_cursor: null,
          start_cursor: null,
        } satisfies PageInfo,
        topic_elections: {},
        hostname_elections: {},
      })
      return
    }

    const applyCurrentUserMutes =
      currentUser && ctx.query.apply_mutes !== undefined
        ? parseBooleanish(ctx.query.apply_mutes)
        : false
    const currentUserIdForMutes = applyCurrentUserMutes ? currentUser?.id : undefined

    // Over-fetch by 1 to detect whether there is a next page.
    const effectiveSearchOptions = { ...searchOptions, limit: limit + 1, cursorId }

    const rawFeeds = currentUserIdForMutes
      ? await searchRssFeeds({ ...effectiveSearchOptions, current_user_id: currentUserIdForMutes })
      : await searchRssFeedsCached(effectiveSearchOptions)

    const allFeeds = rawFeeds as ViewRssFeed[]
    const hasNextPage = allFeeds.length > limit && !searchOptions.text_search_query
    const pageFeeds = allFeeds.slice(0, limit).map(proxyRssFeedCoverArt)

    setAnonymousPublicCacheHeaders(ctx, currentUser, HTTP_CACHE_SHORT_MAX_AGE_SECONDS)

    // Compute sidecars from the page slice only (not the over-fetched row).
    const sidecars = await buildRssFeedSidecars(pageFeeds, currentUser)

    ctx.json(
      apiResponse('GET:/api/v1/rss-feeds', {
        results: pageFeeds,
        page_info: buildPageInfo(pageFeeds, {
          hasNextPage,
          getCursor: feed => ({ id: feed.id }),
        }),
        ...sidecars,
      }),
    )
  })
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'POST:/api/v1/rss-feeds')
    assertNotSuspended(currentUser)

    // apiRequest gives this wrapper-parsed body a real documented shape (rather than the
    // harvester's honest-but-loose `unknown` fallback for a JSON read that feeds directly into
    // another function call) — parseCreateSourceBody does its own runtime validation below.
    const body = parseCreateSourceBody(
      apiRequest(
        'POST:/api/v1/rss-feeds',
        (await ctx.request.json('1mb')) as { rss_feed_url?: unknown; follow?: unknown },
      ),
    )
    const membershipPlan = await getUserActivePlan(currentUser.id)
    const result = await createSourceFromUrl(currentUser, body.rss_feed_url, {
      assertContributionLimit: () =>
        assertWithinContributionActionLimit(currentUser, membershipPlan, 'rss_feed'),
      follow: body.follow,
    })

    ctx.setStatus(result.status === 'created' ? 201 : 200)
    ctx.json(result)
  })
