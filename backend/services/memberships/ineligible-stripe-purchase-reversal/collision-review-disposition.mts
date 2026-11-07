import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import { createCodedError } from '@vouchington/sentry'
import { CONFLICT, INVALID_INPUT, NOT_FOUND } from '@modules/on-error/error-codes'
import { recordModeratorAction } from '@services/moderator-actions'
import sql from 'sql-template-strings'
import {
  insertStaffStripePurchaseCollisionCase,
  type StaffCaseFields,
} from './collision-review-case-insert.mts'

const MAX_MINOR_UNITS = 9_007_199_254_740_991

export type StaffCollisionReviewDisposition = {
  actorUserId: string
  reviewId: string
  amountMinorUnits?: number
  stripePriceId?: string
  currencyCode?: string
  periodStartedAt?: Date
  periodEndsAt?: Date
}

/** Rejects a missing or non-positive amount before a review is dismissed. */
function rejectNonPositiveStaffReversalAmount(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_MINOR_UNITS)
    throw createCodedError(
      400,
      'Staff reversal amount must be a positive safe integer.',
      INVALID_INPUT,
    )
}

/**
 * Discovery inserts the reversal case, then the review. Dispose uses that same
 * order: the case insert takes FOR KEY SHARE on membership_sources, then
 * membership_lineage_bindings, then currencies, and only then deletes the review.
 * The review is not row-locked before the case insert. The moderator action is recorded
 * after that delete, in the same transaction.
 */
export async function disposeStripePurchaseCollisionReview(
  input: StaffCollisionReviewDisposition,
): Promise<{ disposed: true; reversal_case_created: boolean }> {
  await using transaction = await beginTransaction()
  const result = await applyStripePurchaseCollisionReviewDisposition(input, transaction)
  await transaction.commit()
  return result
}

/** Applies one disposition inside the caller's transaction. Explain rolls this back. */
export async function applyStripePurchaseCollisionReviewDisposition(
  input: StaffCollisionReviewDisposition,
  query: QueryExecutor,
): Promise<{ disposed: true; reversal_case_created: boolean }> {
  const amount = input.amountMinorUnits
  if (amount === undefined) {
    if (!(await deleteReview(input.reviewId, query)))
      throw createCodedError(404, 'Stripe purchase collision review not found.', NOT_FOUND)
    await recordDisposition(input.actorUserId, input.reviewId, 'dismissed', undefined, query)
    return { disposed: true, reversal_case_created: false }
  }
  const staffCase = assertStaffCase(input, amount)
  const counts = await insertStaffStripePurchaseCollisionCase(staffCase, query)
  if (counts.reviewCount === 0)
    throw createCodedError(404, 'Stripe purchase collision review not found.', NOT_FOUND)
  if (counts.matchedCount === 0)
    throw createCodedError(
      400,
      'Stripe price and currency do not match a price stored for this lineage.',
      INVALID_INPUT,
    )
  if (counts.insertedCount !== 1)
    throw createCodedError(
      409,
      'A reversal case already exists for this lineage and invoice.',
      CONFLICT,
    )
  if (!(await deleteReview(staffCase.reviewId, query)))
    throw createCodedError(404, 'Stripe purchase collision review not found.', NOT_FOUND)
  if (!counts.insertedId)
    throw new Error('Staff reversal case write did not return the inserted case')
  await recordDisposition(
    input.actorUserId,
    staffCase.reviewId,
    'reversal_case_created',
    counts.insertedId,
    query,
  )
  return { disposed: true, reversal_case_created: true }
}

async function recordDisposition(
  actorUserId: string,
  reviewId: string,
  disposition: 'dismissed' | 'reversal_case_created',
  reversalCaseId: string | undefined,
  query: QueryExecutor,
): Promise<void> {
  await recordModeratorAction(
    actorUserId,
    {
      actionType: 'stripe_purchase_collision_review_dispose',
      metadata: {
        review_id: reviewId,
        disposition,
        ...(reversalCaseId === undefined ? {} : { reversal_case_id: reversalCaseId }),
      },
    },
    { query },
  )
}

function assertStaffCase(input: StaffCollisionReviewDisposition, amount: number): StaffCaseFields {
  rejectNonPositiveStaffReversalAmount(amount)
  const price = input.stripePriceId
  const currency = input.currencyCode
  const started = input.periodStartedAt
  const ended = input.periodEndsAt
  if (!price || !currency || !started || !ended)
    throw createCodedError(
      400,
      'Staff reversal price, currency, and period are required with an amount.',
      INVALID_INPUT,
    )
  if (price !== price.trim() || price.length < 1 || price.length > 255)
    throw createCodedError(
      400,
      'Staff reversal price is not a stored lineage price.',
      INVALID_INPUT,
    )
  if (currency !== currency.trim() || currency.length !== 3)
    throw createCodedError(
      400,
      'Stripe price and currency do not match a price stored for this lineage.',
      INVALID_INPUT,
    )
  if (
    !(started instanceof Date) ||
    !(ended instanceof Date) ||
    Number.isNaN(started.getTime()) ||
    Number.isNaN(ended.getTime())
  )
    throw createCodedError(400, 'Staff reversal period is not a valid interval.', INVALID_INPUT)
  if (ended.getTime() <= started.getTime())
    throw createCodedError(400, 'Staff reversal period end must be after the start.', INVALID_INPUT)
  return {
    reviewId: input.reviewId,
    amount,
    stripePriceId: price,
    currencyCode: currency,
    periodStartedAt: started,
    periodEndsAt: ended,
  }
}

async function deleteReview(reviewId: string, query: QueryExecutor): Promise<boolean> {
  const { rows } = await query(sql`/* deleteStripePurchaseCollisionReview */
    DELETE FROM membership_stripe_purchase_collision_reviews
    WHERE id = ${reviewId}::uuid
    RETURNING id
  `)
  return rows.length === 1
}
