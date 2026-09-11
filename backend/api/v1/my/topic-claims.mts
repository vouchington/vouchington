import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import { listTopicClaimsForUser } from '@services/topic-claims'

// GET /api/v1/my/topic-claims — list current user's topic claims
app.route('/api/v1/my/topic-claims').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/topic-claims')
  const claims = await listTopicClaimsForUser(currentUser.id)
  ctx.json({ claims })
})
