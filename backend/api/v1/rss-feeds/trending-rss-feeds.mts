import { streamJsonObject } from '@jongleberry/api-server'
import app from '../../app.mts'
import { getOptionalAuthAndRateLimit } from '../../response-helpers.mts'
import { getTrendingRssFeeds } from '@services/trending-rss-feeds/get-trending-rss-feeds'
import { getTrendingRssFeedsCached } from '@services/entity-fetch/search-caches'
import { getRssFeedByIdCachedBatch } from '@services/entity-fetch'
import { proxyRssFeedCoverArt } from '@services/rss-feeds/proxy-cover-art'
import { createPaginationParser } from '@modules/pagination'
import { indexById } from '@modules/utils'
import { parseNumberParam } from '@ts-shared/utils/query'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

const VALID_TIME_RANGES = new Set(['day', 'week', 'month'])

const trendingRssFeedsParser = createPaginationParser({
  cursor: { type: 'score' },
  limit: { min: 1, max: 100, default: 20 },
})

app.route('/api/v1/rss-feeds/trending').get(async ctx => {
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/rss-feeds/trending')

  const paginationOptions = trendingRssFeedsParser.parse(ctx.query)

  let timeRange: 'day' | 'week' | 'month' = 'week'
  if (ctx.query.time_range !== undefined) {
    const tr = String(ctx.query.time_range)
    if (!VALID_TIME_RANGES.has(tr)) {
      ctx.throw(400, 'Invalid time range')
    }
    timeRange = tr as 'day' | 'week' | 'month'
  }

  const minScore = parseNumberParam(ctx.query, 'min_score')
  if (minScore !== undefined && minScore < 0) {
    ctx.throw(400, 'Min score must be >= 0')
  }

  const searchOptions = {
    ...paginationOptions,
    timeRange,
    ...(minScore !== undefined && { minScore }),
  }

  const result = currentUser
    ? await getTrendingRssFeeds(searchOptions)
    : await getTrendingRssFeedsCached(searchOptions)

  const feedIds = result.results.map((r: { id: string }) => r.id)

  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }

  const output: Record<string, unknown> = {
    results: result.results,
    page_info: result.page_info,
    rss_feeds: getRssFeedByIdCachedBatch(feedIds).then(feeds =>
      indexById(
        feeds.filter((f): f is NonNullable<typeof f> => f != null).map(proxyRssFeedCoverArt),
      ),
    ),
  }

  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(output))
})
