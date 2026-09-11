import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import { currentUserCanViewMembershipHistory } from '@services/memberships/authorization'
import { getMembershipHistory } from '@services/memberships/get'

app.route('/api/v1/memberships/history/:userId').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/memberships/history/:userId')

  const userId = ctx.params.userId!

  if (!currentUserCanViewMembershipHistory(currentUser, userId)) {
    ctx.throw(403, 'Admin access required')
  }

  const changes = await getMembershipHistory(userId)
  ctx.json({ changes })
})
