import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { getRecommendedRssFeeds } from '@services/recommended-rss-feeds/get-recommendations'
import type { RecommendationSource } from '@services/recommended-rss-feeds/types'
import { getRssFeedByIdCachedBatch } from '@services/entity-fetch'
import { proxyRssFeedCoverArt } from '@services/rss-feeds/proxy-cover-art'
import { createPaginationParser, defineQueryContract, queryString } from '@modules/pagination'
import { indexById } from '@modules/utils'
import { apiQuery } from '../../response-contract.mts'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'

const VALID_SOURCES = new Set<RecommendationSource>(['friends', 'topic', 'collaborative', 'all'])

const recommendedRssFeedsParser = createPaginationParser({
  cursor: { type: 'score' },
  limit: { min: 1, max: 100, default: 20 },
})
const recommendedRssFeedsQueryContract = defineQueryContract({ source: queryString() })

app.route('/api/v1/rss-feeds/recommended').get(async (ctx: Context) => {
  apiQuery(
    'GET:/api/v1/rss-feeds/recommended',
    recommendedRssFeedsParser,
    recommendedRssFeedsQueryContract,
  )
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/rss-feeds/recommended')

  const paginationOptions = recommendedRssFeedsParser.parse(ctx.query)
  const query = prepareQueryForValidation(ctx.query, {
    ...recommendedRssFeedsParser.queryContract,
    ...recommendedRssFeedsQueryContract.queryContract,
  })
  if (ctx.query.limit !== undefined) query.limit = paginationOptions.limit
  validateRequestContract(ctx, 'GET:/api/v1/rss-feeds/recommended', { query })

  let source: RecommendationSource = 'all'
  if (ctx.query.source !== undefined) {
    const s = String(ctx.query.source) as RecommendationSource
    if (!VALID_SOURCES.has(s)) {
      ctx.throw(400, 'Invalid source. Must be one of: friends, topic, collaborative, all')
    }
    source = s
  }

  const result = await getRecommendedRssFeeds(currentUser.id, {
    ...paginationOptions,
    source,
  })

  ctx.set('Cache-Control', 'private, no-store')

  const feedIds = result.results.map(r => r.id)

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
