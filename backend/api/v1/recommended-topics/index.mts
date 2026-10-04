import { parseRuntimePagination } from '@voucha/api/runtime-pagination'
import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { apiQuery } from '../../response-contract.mts'
import { createPaginationParser, defineQueryContract, queryBoolean } from '@modules/pagination'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import { getRecommendedTopics } from '@services/recommended-topics'
import { getTopicByAnyCachedBatch, getTopicMetricsByAnyCachedBatch } from '@services/entity-fetch'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import { indexById } from '@modules/utils'
import { parseBooleanish } from '@ts-shared/utils/query'

// Pagination parser for recommended topics
const recommendedTopicsParser = createPaginationParser({
  cursor: { type: ['score', 'name'] as const },
  limit: { min: 1, max: 100, default: 25 },
  filters: {
    topicTypes: true,
    sort: ['score', 'best'] as const,
  },
})
const recommendedTopicsFilters = defineQueryContract({
  spending_category: queryBoolean(),
  rss_feed: queryBoolean(),
})

app.route('/api/v1/recommended-topics').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/recommended-topics', recommendedTopicsParser, recommendedTopicsFilters)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/recommended-topics')

  // Parse pagination and common filters
  const paginationOptions = parseRuntimePagination(recommendedTopicsParser, ctx.query)
  const query = prepareQueryForValidation(ctx.query, {
    ...recommendedTopicsParser.queryContract,
    ...recommendedTopicsFilters.queryContract,
  })
  if (ctx.query.limit !== undefined) query.limit = paginationOptions.limit
  if (ctx.query.spending_category !== undefined)
    query.spending_category = parseBooleanish(ctx.query.spending_category)
  if (ctx.query.rss_feed !== undefined) query.rss_feed = parseBooleanish(ctx.query.rss_feed)
  validateRequestContract(ctx, 'GET:/api/v1/recommended-topics', { query })

  // Parse topic-specific parameters
  const searchOptions = {
    ...paginationOptions,
    ...(ctx.query.spending_category !== undefined && {
      spending_category: parseBooleanish(ctx.query.spending_category),
    }),
    ...(ctx.query.rss_feed !== undefined && { rss_feed: parseBooleanish(ctx.query.rss_feed) }),
  }
  const result = await getRecommendedTopics(currentUser, searchOptions)
  const topicIds = result.results.map(r => r.id)

  // Use streaming pattern: pass promises directly to allow independent streaming
  const output: Record<string, unknown> = {
    results: result.results,
    page_info: result.page_info,
    topics: getTopicByAnyCachedBatch(topicIds).then(indexById),
    topics_metrics: getTopicMetricsByAnyCachedBatch(topicIds).then(indexById),
  }

  output.bookmarks = getBookmarksForEntities(currentUser, 'topic', topicIds).then(bookmarks =>
    Object.keys(bookmarks).length > 0 ? bookmarks : undefined,
  )

  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(output))
})
