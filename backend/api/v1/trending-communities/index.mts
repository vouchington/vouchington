import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getOptionalAuthAndRateLimit, validateRequestContract } from '../../response-helpers.mts'
import { apiQuery } from '../../response-contract.mts'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import { getTrendingCommunities } from '@services/trending-communities'
import { getTrendingCommunitiesCached } from '@services/entity-fetch/search-caches'
import { createPaginationParser } from '@modules/pagination'
import { clampAnonLimit } from '@modules/search-utils'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

const trendingCommunitiesParser = createPaginationParser({
  cursor: { type: 'score' },
  limit: { min: 1, max: 50, default: 10 },
})

// GET /api/v1/trending-communities
app.route('/api/v1/trending-communities').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/trending-communities', trendingCommunitiesParser)
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/trending-communities')

  const parsed = trendingCommunitiesParser.parse(ctx.query)
  const query = prepareQueryForValidation(ctx.query, trendingCommunitiesParser.queryContract)
  if (ctx.query.limit !== undefined) query.limit = parsed.limit
  validateRequestContract(ctx, 'GET:/api/v1/trending-communities', { query })
  const limit = currentUser ? parsed.limit : clampAnonLimit(parsed.limit)

  const searchOptions = {
    limit,
    after: parsed.after,
  }
  const result = currentUser
    ? await getTrendingCommunities(searchOptions)
    : await getTrendingCommunitiesCached(searchOptions)

  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }

  ctx.json(result)
})
