import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  requireAuthForSuspendedException,
  validateRequestContract,
} from '../../response-helpers.mts'
import { getManageableStripeSubscriptionByUserId } from '@services/memberships'
import { createBillingPortalSession } from '../../stripe-helpers.mts'
import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'

type BillingPortalSessionRequest = { return_url: string }

app.route('/api/v1/memberships/billing-portal-sessions').post(async (ctx: Context) => {
  const currentUser = await requireAuthForSuspendedException(
    ctx,
    'POST:/api/v1/memberships/billing-portal-sessions',
  )

  const body = (await ctx.request.json('1mb')) as BillingPortalSessionRequest
  validateRequestContract(ctx, 'POST:/api/v1/memberships/billing-portal-sessions', { body })
  ctx.assert(body.return_url.startsWith('/'), 400, 'return_url must be a relative path')

  const subscription = await getManageableStripeSubscriptionByUserId(currentUser.id)
  ctx.assert(subscription, 400, 'No active Stripe subscription')

  const baseUrl = SITEMAP_CONFIG.BASE_URL
  const session = await createBillingPortalSession({
    customerId: subscription.customerId,
    returnUrl: `${baseUrl}${body.return_url}`,
    cancellationSubscriptionId: currentUser.suspended_at ? subscription.subscriptionId : undefined,
  })

  ctx.json({ portal_session: { url: session.url } })
})
