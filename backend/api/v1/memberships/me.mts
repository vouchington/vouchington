import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import { getMembershipOverview } from '@services/memberships'

app.route('/api/v1/memberships/me').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/memberships/me')

  ctx.json(await getMembershipOverview(currentUser.id))
})
