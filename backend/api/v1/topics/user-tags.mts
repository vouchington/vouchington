import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getUserTagTopics } from '@services/topics/user-tag-topics'
import { requireAuth } from '../../response-helpers.mts'

app.route('/api/v1/topics/user-tags').get(async (ctx: Context) => {
  await requireAuth(ctx, 'GET:/api/v1/topics/user-tags')
  ctx.json({ user_tags: await getUserTagTopics() })
})
