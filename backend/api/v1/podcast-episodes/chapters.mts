import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { getOptionalAuthAndRateLimit, validateUUIDParam } from '../../response-helpers.mts'
import { getPodcastEpisodeChaptersById } from '@services/rss-feed-items/chapters'

app.route('/api/v1/podcast-episodes/:id/chapters').get(async (ctx: Context) => {
  const currentUser = await getOptionalAuthAndRateLimit(
    ctx,
    'GET:/api/v1/podcast-episodes/:id/chapters',
  )
  const rssFeedItemId = validateUUIDParam(ctx, 'id')

  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }

  const chapters = await getPodcastEpisodeChaptersById(rssFeedItemId)
  ctx.json({ chapters })
})
