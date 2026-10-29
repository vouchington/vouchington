import { parseRuntimePagination } from '@voucha/api/runtime-pagination'
import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { createPaginationParser } from '@modules/pagination'
import { getSignupCountByReferrerId } from '@services/attribution'
import { getLandingPageAnalyticsByPageId } from '@services/landing-page-analytics'
import {
  getLandingPageByUsernameAndSlug,
  getLandingPageCanonicalIdentityById,
  listLandingPagesForUserPage,
} from '@services/my'
import { isAdminUser } from '@services/users'
import {
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'

const landingPagesPagination = createPaginationParser({
  cursor: { type: 'tier' },
  limit: { min: 1, max: 100, default: 25 },
})

app.route('/api/v1/admin/users/:userId/landing-pages').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, isAdminUser, 'GET:/api/v1/admin/users/:userId/landing-pages')

  const userId = validateUUIDParam(ctx, 'userId')
  validateRequestContract(ctx, 'GET:/api/v1/admin/users/:userId/landing-pages', {
    path: ctx.params,
  })
  const pagination = parseRuntimePagination(landingPagesPagination, ctx.query)
  ctx.json(
    await listLandingPagesForUserPage(userId, {
      limit: pagination.limit,
      after: pagination.after,
    }),
  )
})

app.route('/api/v1/admin/landing-pages/:pageId').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, isAdminUser, 'GET:/api/v1/admin/landing-pages/:pageId')
  const pageId = validateUUIDParam(ctx, 'pageId')
  validateRequestContract(ctx, 'GET:/api/v1/admin/landing-pages/:pageId', { path: ctx.params })
  ctx.json(await getLandingPageCanonicalIdentityById(pageId))
})

app
  .route('/api/v1/admin/users/:username/landing-pages/:slug/analytics')
  .get(async (ctx: Context) => {
    await requireAuthAndRateLimit(
      ctx,
      isAdminUser,
      'GET:/api/v1/admin/users/:username/landing-pages/:slug/analytics',
    )

    validateRequestContract(
      ctx,
      'GET:/api/v1/admin/users/:username/landing-pages/:slug/analytics',
      {
        path: ctx.params,
      },
    )
    const landingPage = await getLandingPageByUsernameAndSlug(
      ctx.params.username!,
      ctx.params.slug!,
    )
    const [analytics, totalSignups] = await Promise.all([
      getLandingPageAnalyticsByPageId(landingPage.id),
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
