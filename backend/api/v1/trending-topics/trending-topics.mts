import { streamJsonObject } from '@jongleberry/api-server'
import app from '../../app.mts'
import { getOptionalAuthAndRateLimit } from '../../response-helpers.mts'
import { getTrendingTopics } from '@services/trending-topics'
import { getTopicByAnyCachedBatch, getTopicMetricsByAnyCachedBatch } from '@services/entity-fetch'
import { getTrendingTopicsCached } from '@services/entity-fetch/search-caches'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import { createPaginationParser } from '@modules/pagination'
import { indexById } from '@modules/utils'
import { parseNumberParam } from '@ts-shared/utils/query'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { clampAnonLimit } from '@modules/search-utils'

const VALID_TIME_RANGES = new Set(['day', 'week', 'month'])

// Pagination parser for trending topics
// Note: trending topics uses a custom time range (day/week/month) not the standard TimeRange type
const trendingTopicsParser = createPaginationParser({
  cursor: { type: 'score' },
  limit: { min: 1, max: 100, default: 20 },
})

app.route('/api/v1/trending-topics').get(async ctx => {
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/trending-topics')

  // Parse pagination options
  const paginationOptions = trendingTopicsParser.parse(ctx.query)

  // Parse trending topics specific parameters
  let timeRange: 'day' | 'week' | 'month' = 'day'
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
  if (!currentUser) searchOptions.limit = clampAnonLimit(searchOptions.limit)

  const result = currentUser
    ? await getTrendingTopics(searchOptions)
    : await getTrendingTopicsCached(searchOptions)
  const topicIds = result.results.map((r: { id: string }) => r.id)

  // Only cache for logged-out users
  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }

  // Use streaming pattern: pass promises directly to allow independent streaming
  const output: Record<string, unknown> = {
    results: result.results,
    page_info: result.page_info,
    topics: getTopicByAnyCachedBatch(topicIds).then(indexById),
    topics_metrics: getTopicMetricsByAnyCachedBatch(topicIds).then(indexById),
  }

  if (currentUser) {
    output.bookmarks = getBookmarksForEntities(currentUser, 'topic', topicIds).then(bookmarks =>
      Object.keys(bookmarks).length > 0 ? bookmarks : undefined,
    )
  }

  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(output))
})
