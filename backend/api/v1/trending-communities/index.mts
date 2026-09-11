import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getOptionalAuthAndRateLimit } from '../../response-helpers.mts'
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
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/trending-communities')

  const parsed = trendingCommunitiesParser.parse(ctx.query)
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
