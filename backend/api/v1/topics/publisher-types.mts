import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'
import { getPublisherTypeTopics } from '@services/topics/publisher-type-topics'

app.route('/api/v1/topics/publisher-types').get(async (ctx: Context) => {
  ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`)
  const publisher_types = await getPublisherTypeTopics()
  ctx.json({ publisher_types })
})
