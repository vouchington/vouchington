import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { apiQuery, apiResponse } from '../../response-contract.mts'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { defineQueryContract, queryUuid } from '@modules/pagination'
import { currentUserCanRefundMembership } from '@services/memberships/authorization'
import { listRefundableCharges } from '@services/memberships/refund-stripe-operations'
import { listSubscriptionInvoicesOperation } from '@modules/stripe/operations'

const refundableChargesQuery = defineQueryContract({
  user_id: queryUuid({ description: 'The member whose refundable charges are listed.' }),
})

app.route('/api/v1/memberships/refundable-charges').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/memberships/refundable-charges', refundableChargesQuery)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/memberships/refundable-charges')

  if (!currentUserCanRefundMembership(currentUser)) {
    ctx.throw(403, 'Administrator access required')
  }

  // A missing or repeated user_id stays a 400; a malformed id is the contract's 422.
  const userId = ctx.query.user_id
  ctx.assert(userId && typeof userId === 'string', 400, 'Missing user_id')
  validateRequestContract(ctx, 'GET:/api/v1/memberships/refundable-charges', {
    query: { user_id: userId },
  })

  const charges = await listRefundableCharges(currentUser.id, userId, {
    listSubscriptionInvoices: listSubscriptionInvoicesOperation,
  })
  ctx.json(apiResponse('GET:/api/v1/memberships/refundable-charges', { charges }))
})
