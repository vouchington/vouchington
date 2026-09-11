import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getOptionalAuthAndRateLimit } from '../../response-helpers.mts'
import { getTrendingReferralPrograms } from '@services/trending-referral-programs'
import { createPaginationParser } from '@modules/pagination'
import { clampAnonLimit } from '@modules/search-utils'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

const trendingReferralProgramsParser = createPaginationParser({
  cursor: { type: 'score' },
  limit: { min: 1, max: 50, default: 10 },
})

// GET /api/v1/trending-referral-programs
app.route('/api/v1/trending-referral-programs').get(async (ctx: Context) => {
  const currentUser = await getOptionalAuthAndRateLimit(
    ctx,
    'GET:/api/v1/trending-referral-programs',
  )

  const parsed = trendingReferralProgramsParser.parse(ctx.query)
  const limit = currentUser ? parsed.limit : clampAnonLimit(parsed.limit)

  const result = await getTrendingReferralPrograms({
    limit,
    after: parsed.after ?? undefined,
  })

  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }

  ctx.json(result)
})
