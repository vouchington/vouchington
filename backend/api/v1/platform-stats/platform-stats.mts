import { setAnonymousPublicCacheHeaders } from '../../cache-headers.mts'
import { streamJsonObject } from '@jongleberry/api-server'
import app from '../../app.mts'
import { getOptionalAuthAndRateLimit } from '../../response-helpers.mts'
import { getPlatformStatsCached } from '@services/entity-fetch/search-caches'

app.route('/api/v1/platform-stats').get(async ctx => {
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/platform-stats')

  const stats = await getPlatformStatsCached({})

  setAnonymousPublicCacheHeaders(ctx, currentUser)

  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(stats))
})
