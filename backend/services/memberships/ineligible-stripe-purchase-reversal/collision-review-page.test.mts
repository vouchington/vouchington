import { encodeScopedUuidCursor } from '@modules/pagination'
import { getStripeMembershipSourceIdentity } from '@services/memberships/create-types'
import { recordStripePurchaseCollisionReviews } from '@services/memberships/ineligible-stripe-purchase-reversal/collision-review'
import { createProviderMembershipSource } from '@services/memberships/provider-source'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { bindStripePurchaseCollisionReviewSeed } from '@voucha/test-helpers/stripe-purchase-collision-review-seed'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  collisionReviewPageConfig,
  getStripePurchaseCollisionReview,
  listStripePurchaseCollisionReviews,
} from './collision-review-page.mts'

const { seedTestStripePurchaseCollisionReview } = bindStripePurchaseCollisionReviewSeed({
  getStripeMembershipSourceIdentity,
  createProviderMembershipSource,
  recordStripePurchaseCollisionReviews,
})

describe('Stripe purchase collision review pages', () => {
  it('returns an owned review by id and omits a missing id', async () => {
    const seeded = await seedTestStripePurchaseCollisionReview()
    await expect(getStripePurchaseCollisionReview(seeded.review.id)).resolves.toMatchObject({
      id: seeded.review.id,
      originating_invoice_id: seeded.invoiceId,
      winning_source_kind: 'direct',
      winning_plan: 'plus',
    })
    await expect(getStripePurchaseCollisionReview(randomUUID())).resolves.toBeNull()
  })

  it('pages older owned reviews without repeating the cursor id', async () => {
    const older = await seedTestStripePurchaseCollisionReview()
    const newer = await seedTestStripePurchaseCollisionReview()
    const first = await listStripePurchaseCollisionReviews({ limit: 100 })
    expect(first.results.map(review => review.id)).toEqual(
      expect.arrayContaining([older.review.id, newer.review.id]),
    )
    const after = encodeScopedUuidCursor(
      newer.review.id,
      'stripe-purchase-collision-reviews:id-desc',
    )
    const second = await listStripePurchaseCollisionReviews({ limit: 100, after })
    const secondIds = second.results.map(review => review.id)
    expect(secondIds).toContain(older.review.id)
    expect(secondIds).not.toContain(newer.review.id)
  })

  it('rejects a cursor from another page scope', async () => {
    const seeded = await seedTestStripePurchaseCollisionReview()
    const foreign = encodeScopedUuidCursor(seeded.review.id, 'membership-history:other')
    await expect(listStripePurchaseCollisionReviews({ after: foreign })).rejects.toMatchObject({
      status: 400,
    })
    await expect(
      listStripePurchaseCollisionReviews({ after: 'not-a-cursor' }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('clamps a larger request to the configured page size', async () => {
    await seedTestStripePurchaseCollisionReview()
    await seedTestStripePurchaseCollisionReview()
    const restore = overrideDynamicConfigFieldsForTest(collisionReviewPageConfig, { page_size: 1 })
    try {
      const page = await listStripePurchaseCollisionReviews({ limit: 50 })
      expect(page.results).toHaveLength(1)
      expect(page.page_info.has_next_page).toBe(true)
    } finally {
      restore()
    }
  })
})
