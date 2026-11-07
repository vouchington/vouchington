import type { QueryExecutor } from '@data-stores/psql'
import { getStripeMembershipSourceIdentity } from '@services/memberships/create-types'
import { recordStripePurchaseCollisionReviews } from '@services/memberships/ineligible-stripe-purchase-reversal/collision-review'
import { createProviderMembershipSource } from '@services/memberships/provider-source'
import { getTestIneligiblePurchaseReversalCase } from '@voucha/test-helpers/entities/memberships-reversals'
import { bindStripePurchaseCollisionReviewSeed } from '@voucha/test-helpers/stripe-purchase-collision-review-seed'
import { readTestStripePurchaseCollisionReview } from '@voucha/test-helpers/stripe-purchase-collision-work'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { insertStaffStripePurchaseCollisionCase } from './collision-review-case-insert.mts'
import {
  applyStripePurchaseCollisionReviewDisposition,
  disposeStripePurchaseCollisionReview,
} from './collision-review-disposition.mts'

const { restoreTestStripePurchaseCollisionReview, seedTestStripePurchaseCollisionReview } =
  bindStripePurchaseCollisionReviewSeed({
    getStripeMembershipSourceIdentity,
    createProviderMembershipSource,
    recordStripePurchaseCollisionReviews,
  })

describe('Stripe purchase collision review disposition', () => {
  it('deletes a review without an amount and does not create a reversal case', async () => {
    const seeded = await seedTestStripePurchaseCollisionReview()
    await expect(
      disposeStripePurchaseCollisionReview({
        reviewId: seeded.review.id,
        stripePriceId: seeded.stripePriceId,
        currencyCode: 'usd',
      }),
    ).resolves.toEqual({ disposed: true, reversal_case_created: false })
    await expect(
      readTestStripePurchaseCollisionReview(seeded.sourceId, seeded.invoiceId),
    ).resolves.toBeNull()
    await expect(
      getTestIneligiblePurchaseReversalCase(seeded.subscriptionId, 'production'),
    ).resolves.toBeNull()
  })

  it('records the stored lineage price and currency, then deletes the review', async () => {
    const seeded = await seedTestStripePurchaseCollisionReview()
    const periodStartedAt = new Date('2025-03-01T00:00:00.000Z')
    const periodEndsAt = new Date('2025-04-01T00:00:00.000Z')
    await expect(
      disposeStripePurchaseCollisionReview({
        reviewId: seeded.review.id,
        amountMinorUnits: 1_200,
        stripePriceId: seeded.stripePriceId,
        currencyCode: 'usd',
        periodStartedAt,
        periodEndsAt,
      }),
    ).resolves.toEqual({ disposed: true, reversal_case_created: true })
    await expect(
      readTestStripePurchaseCollisionReview(seeded.sourceId, seeded.invoiceId),
    ).resolves.toBeNull()
    await expect(
      getTestIneligiblePurchaseReversalCase(seeded.subscriptionId, 'production'),
    ).resolves.toEqual({
      currency_code: 'usd',
      qualifying_amount_minor_units: '1200',
      refund_cap_minor_units: '1200',
      stripe_price_id: seeded.stripePriceId,
    })
  })

  it('keeps the review when an amount is sent for an invoice that already has a case', async () => {
    const seeded = await seedTestStripePurchaseCollisionReview()
    await disposeStripePurchaseCollisionReview(staffAmount(seeded))
    const restored = await restoreTestStripePurchaseCollisionReview(seeded)
    await expect(
      disposeStripePurchaseCollisionReview({ ...staffAmount(seeded), reviewId: restored.id }),
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      readTestStripePurchaseCollisionReview(seeded.sourceId, seeded.invoiceId),
    ).resolves.toMatchObject({ id: restored.id })
    await expect(
      getTestIneligiblePurchaseReversalCase(seeded.subscriptionId, 'production'),
    ).resolves.toMatchObject({ refund_cap_minor_units: '1200' })
  })

  it('rejects a price or currency that is not stored for the lineage and keeps the review', async () => {
    const seeded = await seedTestStripePurchaseCollisionReview()
    await expect(
      disposeStripePurchaseCollisionReview({
        ...staffAmount(seeded),
        stripePriceId: `price_${randomUUID()}`,
      }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      disposeStripePurchaseCollisionReview({ ...staffAmount(seeded), currencyCode: 'eur' }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      readTestStripePurchaseCollisionReview(seeded.sourceId, seeded.invoiceId),
    ).resolves.toMatchObject({ id: seeded.review.id })
    await expect(
      getTestIneligiblePurchaseReversalCase(seeded.subscriptionId, 'production'),
    ).resolves.toBeNull()
  })

  it('rejects a non-positive amount or a period that does not end after it starts', async () => {
    const seeded = await seedTestStripePurchaseCollisionReview()
    const started = new Date('2025-03-01T00:00:00.000Z')
    await expect(
      disposeStripePurchaseCollisionReview({ ...staffAmount(seeded), amountMinorUnits: 0 }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      disposeStripePurchaseCollisionReview({
        ...staffAmount(seeded),
        periodStartedAt: started,
        periodEndsAt: started,
      }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      readTestStripePurchaseCollisionReview(seeded.sourceId, seeded.invoiceId),
    ).resolves.toMatchObject({ id: seeded.review.id })
  })

  it('returns not found when the review is already gone', async () => {
    await expect(
      disposeStripePurchaseCollisionReview({ reviewId: randomUUID() }),
    ).rejects.toMatchObject({ status: 404 })
    const seeded = await seedTestStripePurchaseCollisionReview()
    await expect(
      disposeStripePurchaseCollisionReview({ ...staffAmount(seeded), reviewId: randomUUID() }),
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      readTestStripePurchaseCollisionReview(seeded.sourceId, seeded.invoiceId),
    ).resolves.toMatchObject({ id: seeded.review.id })
  })

  it('rejects an amount that is missing its price, currency, or a real period', async () => {
    const seeded = await seedTestStripePurchaseCollisionReview()
    await expect(
      disposeStripePurchaseCollisionReview({
        reviewId: seeded.review.id,
        amountMinorUnits: 1_200,
      }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      disposeStripePurchaseCollisionReview({
        ...staffAmount(seeded),
        stripePriceId: ` ${seeded.stripePriceId}`,
      }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      disposeStripePurchaseCollisionReview({ ...staffAmount(seeded), currencyCode: 'usd ' }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      disposeStripePurchaseCollisionReview({
        ...staffAmount(seeded),
        periodStartedAt: new Date('not-a-date'),
      }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      readTestStripePurchaseCollisionReview(seeded.sourceId, seeded.invoiceId),
    ).resolves.toMatchObject({ id: seeded.review.id })
  })

  it('keeps the review when the case insert cannot read its counts or the delete misses', async () => {
    const seeded = await seedTestStripePurchaseCollisionReview()
    const staff = staffAmount(seeded)
    const counts = { reviewCount: 'bad', matchedCount: 1, insertedCount: 1, existingCount: 0 }
    await expect(
      insertStaffStripePurchaseCollisionCase(
        {
          reviewId: staff.reviewId,
          amount: staff.amountMinorUnits,
          stripePriceId: staff.stripePriceId,
          currencyCode: staff.currencyCode,
          periodStartedAt: staff.periodStartedAt,
          periodEndsAt: staff.periodEndsAt,
        },
        rowsQuery([counts]),
      ),
    ).rejects.toThrow('Staff reversal case write did not return a count')
    let calls = 0
    const disappearingReview: QueryExecutor = () => {
      calls += 1
      return Promise.resolve(
        calls === 1
          ? { command: '', fields: [], rowCount: 1, rows: [{ ...counts, reviewCount: 1 }] }
          : { command: '', fields: [], rowCount: 0, rows: [] },
      )
    }
    await expect(
      applyStripePurchaseCollisionReviewDisposition(staffAmount(seeded), disappearingReview),
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      readTestStripePurchaseCollisionReview(seeded.sourceId, seeded.invoiceId),
    ).resolves.toMatchObject({ id: seeded.review.id })
  })
})

function rowsQuery(rows: ReadonlyArray<Record<string, unknown>>): QueryExecutor {
  return () => Promise.resolve({ command: '', fields: [], rowCount: rows.length, rows: [...rows] })
}

function staffAmount(seeded: Awaited<ReturnType<typeof seedTestStripePurchaseCollisionReview>>) {
  return {
    reviewId: seeded.review.id,
    amountMinorUnits: 1_200,
    stripePriceId: seeded.stripePriceId,
    currencyCode: 'usd',
    periodStartedAt: new Date('2025-03-01T00:00:00.000Z'),
    periodEndsAt: new Date('2025-04-01T00:00:00.000Z'),
  }
}
