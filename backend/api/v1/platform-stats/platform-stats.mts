import { streamJsonObject } from '@jongleberry/api-server'
import app from '../../app.mts'
import { getOptionalAuthAndRateLimit } from '../../response-helpers.mts'
import { getPlatformStats } from '@services/platform-stats'
import { getPlatformStatsCached } from '@services/entity-fetch/search-caches'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

app.route('/api/v1/platform-stats').get(async ctx => {
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/platform-stats')

  const stats = currentUser ? await getPlatformStats() : await getPlatformStatsCached({})

  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }

  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(stats))
})
