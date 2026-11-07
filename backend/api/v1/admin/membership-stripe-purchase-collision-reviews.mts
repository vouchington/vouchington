import { createPaginationParser } from '@modules/pagination'
import { createCodedError } from '@vouchington/sentry'
import { INVALID_INPUT, NOT_FOUND } from '@modules/on-error/error-codes'
import type { Money } from '@ts-shared/money'
import { isAdminUser } from '@services/users'
import {
  getStripePurchaseCollisionReview,
  listStripePurchaseCollisionReviews,
} from '@services/memberships/ineligible-stripe-purchase-reversal/collision-review-page'
import {
  disposeStripePurchaseCollisionReview,
  rejectNonPositiveStaffReversalAmount,
} from '@services/memberships/ineligible-stripe-purchase-reversal/collision-review-disposition'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import type { Context } from '@jongleberry/api-server'
import { apiQuery } from '../../api-query-contract.mts'
import app from '../../app.mts'
import {
  parseJsonBody,
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'

const LIST = 'GET:/api/v1/admin/membership-stripe-purchase-collision-reviews'
const DETAIL = 'GET:/api/v1/admin/membership-stripe-purchase-collision-reviews/:id'
const DISPOSE = 'POST:/api/v1/admin/membership-stripe-purchase-collision-reviews/:id/disposition'

const reviewPagination = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})

type DispositionBody = {
  amount?: Money
  stripe_price_id?: string
  period_started_at?: string
  period_ends_at?: string
}

app
  .route('/api/v1/admin/membership-stripe-purchase-collision-reviews')
  .get(async (ctx: Context) => {
    apiQuery(LIST, reviewPagination)
    await requireAuthAndRateLimit(ctx, isAdminUser, LIST)
    const pagination = reviewPagination.parse(ctx.query)
    const query = prepareQueryForValidation(ctx.query, reviewPagination.queryContract)
    if (ctx.query.limit !== undefined) query.limit = pagination.limit
    validateRequestContract(ctx, LIST, { query })
    ctx.json(
      await listStripePurchaseCollisionReviews({
        limit: pagination.limit,
        after: pagination.after,
      }),
    )
  })

app
  .route('/api/v1/admin/membership-stripe-purchase-collision-reviews/:id')
  .get(async (ctx: Context) => {
    await requireAuthAndRateLimit(ctx, isAdminUser, DETAIL)
    const reviewId = validateUUIDParam(ctx, 'id')
    validateRequestContract(ctx, DETAIL, { path: ctx.params })
    const review = await getStripePurchaseCollisionReview(reviewId)
    if (!review)
      throw createCodedError(404, 'Stripe purchase collision review not found.', NOT_FOUND)
    ctx.json(review)
  })

app
  .route('/api/v1/admin/membership-stripe-purchase-collision-reviews/:id/disposition')
  .post(async (ctx: Context) => {
    await requireAuthAndRateLimit(ctx, isAdminUser, DISPOSE)
    const reviewId = validateUUIDParam(ctx, 'id')
    const body = await parseJsonBody<DispositionBody>(ctx)
    if (body.amount !== undefined) {
      const minorUnits = body.amount?.amount
      if (typeof minorUnits !== 'number')
        throw createCodedError(
          400,
          'Staff reversal amount must be a positive safe integer.',
          INVALID_INPUT,
        )
      rejectNonPositiveStaffReversalAmount(minorUnits)
    }
    validateRequestContract(ctx, DISPOSE, { path: ctx.params, body })
    ctx.json(
      await disposeStripePurchaseCollisionReview({
        reviewId,
        amountMinorUnits: body.amount?.amount,
        stripePriceId: body.stripe_price_id,
        currencyCode: body.amount?.currency,
        periodStartedAt: optionalDate(body.period_started_at),
        periodEndsAt: optionalDate(body.period_ends_at),
      }),
    )
  })

function optionalDate(value: string | undefined): Date | undefined {
  if (value === undefined) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    throw createCodedError(400, 'Staff reversal period is not a valid interval.', INVALID_INPUT)
  return date
}
