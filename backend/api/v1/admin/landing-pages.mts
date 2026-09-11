import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { createPaginationParser } from '@modules/pagination'
import { getSignupCountByReferrerId } from '@services/attribution'
import { getLandingPageAnalyticsByPageId } from '@services/landing-page-analytics'
import { getLandingPageById, listLandingPagesForUserPage } from '@services/my'
import { isAdminUser } from '@services/users'
import { requireAuthAndRateLimit, validateUUIDParam } from '../../response-helpers.mts'

const landingPagesPagination = createPaginationParser({
  cursor: { type: 'tier' },
  limit: { min: 1, max: 100, default: 25 },
})

app.route('/api/v1/admin/users/:userId/landing-pages').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, isAdminUser, 'GET:/api/v1/admin/users/:userId/landing-pages')

  const userId = validateUUIDParam(ctx, 'userId')
  const pagination = landingPagesPagination.parse(ctx.query)
  ctx.json(
    await listLandingPagesForUserPage(userId, {
      limit: pagination.limit,
      after: pagination.after,
    }),
  )
})

app.route('/api/v1/admin/landing-pages/:pageId/analytics').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    isAdminUser,
    'GET:/api/v1/admin/landing-pages/:pageId/analytics',
  )

  const pageId = validateUUIDParam(ctx, 'pageId')
  const landingPage = await getLandingPageById(pageId)
  const [analytics, totalSignups] = await Promise.all([
    getLandingPageAnalyticsByPageId(pageId),
    getSignupCountByReferrerId(landingPage.user_id),
  ])

  ctx.json({
    landing_page: landingPage,
    analytics: {
      ...analytics,
      conversion_funnel: {
        total_visits: analytics.total_visits,
        total_clicks: analytics.total_clicks,
        total_signups: totalSignups,
        visit_to_click_rate: analytics.ctr,
      },
    },
  })
})
