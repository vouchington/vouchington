import { setAnonymousPublicCacheHeaders } from '../../cache-headers.mts'
import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  getOptionalAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import { getPodcastEpisodeChaptersById } from '@services/rss-feed-items/chapters'

app.route('/api/v1/podcast-episodes/:id/chapters').get(async (ctx: Context) => {
  const currentUser = await getOptionalAuthAndRateLimit(
    ctx,
    'GET:/api/v1/podcast-episodes/:id/chapters',
  )
  validateRequestContract(ctx, 'GET:/api/v1/podcast-episodes/:id/chapters', { path: ctx.params })
  const rssFeedItemId = validateUUIDParam(ctx, 'id')

  setAnonymousPublicCacheHeaders(ctx, currentUser)

  const chapters = await getPodcastEpisodeChaptersById(rssFeedItemId)
  ctx.json({ chapters })
})
