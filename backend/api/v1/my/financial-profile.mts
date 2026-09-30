import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import {
  getUserFinancialProfile,
  upsertUserFinancialProfile,
  assertValidFinancialProfile,
  type UserFinancialProfileInput,
} from '@services/user-financial-profiles'

type UpdateFinancialProfileRequest = UserFinancialProfileInput

// GET /api/v1/my/financial-profile
app.route('/api/v1/my/financial-profile').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/financial-profile')

  const financial_profile = await getUserFinancialProfile(currentUser.id)
  ctx.json({ financial_profile })
})

// PUT /api/v1/my/financial-profile
app.route('/api/v1/my/financial-profile').put(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PUT:/api/v1/my/financial-profile')

  const body = (await ctx.request.json('10kb')) as UpdateFinancialProfileRequest
  validateRequestContract(ctx, 'PUT:/api/v1/my/financial-profile', { body })
  // The schema fixes shapes; the service also enforces value ranges and single-currency money.
  assertValidFinancialProfile(body)

  const financial_profile = await upsertUserFinancialProfile(currentUser.id, {
    currency: body.currency,
    credit_score_range: body.credit_score_range,
    stated_income_range: body.stated_income_range,
    total_credit_limit: body.total_credit_limit,
    years_of_credit_history: body.years_of_credit_history,
    hard_inquiries_12m: body.hard_inquiries_12m,
    cards_opened_24m: body.cards_opened_24m,
  })

  ctx.json({ financial_profile })
})
