import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import {
  getUserFinancialProfile,
  upsertUserFinancialProfile,
  assertValidFinancialProfile,
} from '@services/user-financial-profiles'
import type { CurrencyCode, Money, MoneyRange } from '@ts-shared/money'

// GET /api/v1/my/financial-profile
app.route('/api/v1/my/financial-profile').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/financial-profile')

  const financial_profile = await getUserFinancialProfile(currentUser.id)
  ctx.json({ financial_profile })
})

// PUT /api/v1/my/financial-profile
app.route('/api/v1/my/financial-profile').put(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PUT:/api/v1/my/financial-profile')

  const rawBody = await ctx.request.json('10kb')
  ctx.assert(
    rawBody !== null && typeof rawBody === 'object' && !Array.isArray(rawBody),
    422,
    'Request body must be a JSON object',
  )
  const body = rawBody as Record<string, unknown>
  assertValidFinancialProfile(body)

  const financial_profile = await upsertUserFinancialProfile(currentUser.id, {
    currency: body.currency as CurrencyCode | undefined,
    credit_score_range: body.credit_score_range as string | null | undefined,
    stated_income_range: body.stated_income_range as MoneyRange | null | undefined,
    total_credit_limit: body.total_credit_limit as Money | null | undefined,
    years_of_credit_history: body.years_of_credit_history as number | null | undefined,
    hard_inquiries_12m: body.hard_inquiries_12m as number | null | undefined,
    cards_opened_24m: body.cards_opened_24m as number | null | undefined,
  })

  ctx.json({ financial_profile })
})
