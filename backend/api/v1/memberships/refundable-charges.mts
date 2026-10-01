import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import { currentUserCanRefundMembership } from '@services/memberships/authorization'
import { listRefundableCharges } from '@services/memberships/refund-stripe-operations'
import { listSubscriptionInvoicesOperation } from '@modules/stripe/operations'
import { isUUID } from '@modules/utils'

app.route('/api/v1/memberships/refundable-charges').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/memberships/refundable-charges')

  if (!currentUserCanRefundMembership(currentUser)) {
    ctx.throw(403, 'Administrator access required')
  }

  // Intentional carrier skip: this route has no registered response contract, so the shared
  // `apiQuery` marker (and therefore `validateRequestContract`) cannot describe its query. The
  // single `user_id` carrier is checked locally, after the role gate and before the service call.
  const userId = ctx.query.user_id
  ctx.assert(userId && typeof userId === 'string', 400, 'Missing user_id')
  ctx.assert(isUUID(userId), 422, 'Invalid user_id')

  const charges = await listRefundableCharges(currentUser.id, userId, {
    listSubscriptionInvoices: listSubscriptionInvoicesOperation,
  })
  ctx.json({ charges })
})
