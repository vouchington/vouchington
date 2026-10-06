import { parseRuntimePagination } from '@voucha/api/runtime-pagination'
import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getRssFeedByIdCached } from '@services/entity-fetch'
import { getMembershipByUserId } from '@services/memberships'
import {
  getRssFeedCrawlById,
  getRssFeedCrawlSummaryById,
  searchRssFeedCrawls,
  toPaidSafeRssFeedCrawl,
} from '@services/rss-feeds/crawls'
import {
  currentUserCanRefreshRssFeed,
  currentUserCanViewLatestRssFeedCrawl,
} from '@services/rss-feeds/authorization'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import { createPaginationParser } from '@modules/pagination'
import { apiQuery, apiResponse } from '../../response-contract.mts'
import { requireAuth, validateRequestContract, validateUUIDParam } from '../../response-helpers.mts'

const rssFeedCrawlsParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 50 },
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

  const options = parseRuntimePagination(rssFeedCrawlsParser, ctx.query)
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
