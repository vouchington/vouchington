import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getPublisherTypeTopics } from '@services/topics/publisher-type-topics'

app.route('/api/v1/topics/publisher-types').get(async (ctx: Context) => {
  ctx.set('Cache-Control', 'public')
  const publisher_types = await getPublisherTypeTopics()
  ctx.json({ publisher_types })
})
