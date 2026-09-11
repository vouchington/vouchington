import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import { getLandingPageAnalyticsByPageId } from '@services/landing-page-analytics'
import { currentUserCanViewLandingPageAnalytics } from '@services/landing-page-analytics/authorization'
import { getSignupCountByReferrerId } from '@services/attribution'
import { getMyLandingPage } from '@services/my'
import { getMembershipByUserId } from '@services/memberships'
import { isUUID } from '@modules/utils'

app.route('/api/v1/my/landing-pages/:pageId/analytics').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/landing-pages/:pageId/analytics')

  const membership = await getMembershipByUserId(currentUser.id)
  if (!currentUserCanViewLandingPageAnalytics(currentUser, membership)) {
    ctx.throw(403, 'Membership required')
  }

  const { pageId } = ctx.params
  ctx.assert(pageId && isUUID(pageId), 400, 'Invalid pageId')

  const landingPage = await getMyLandingPage(currentUser.id, pageId)
  const [analytics, totalSignups] = await Promise.all([
    getLandingPageAnalyticsByPageId(pageId),
    getSignupCountByReferrerId(landingPage.user_id),
  ])

  const conversionFunnel = {
    total_visits: analytics.total_visits,
    total_clicks: analytics.total_clicks,
    total_signups: totalSignups,
    visit_to_click_rate: analytics.ctr,
  }

  ctx.json({ analytics: { ...analytics, conversion_funnel: conversionFunnel } })
})
