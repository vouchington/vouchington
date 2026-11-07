import { encodeScopedUuidCursor } from '@modules/pagination'
import { getStripeMembershipSourceIdentity } from '@services/memberships/create-types'
import { collisionReviewPageConfig } from '@services/memberships/ineligible-stripe-purchase-reversal/collision-review-page'
import { recordStripePurchaseCollisionReviews } from '@services/memberships/ineligible-stripe-purchase-reversal/collision-review'
import { createProviderMembershipSource } from '@services/memberships/provider-source'
import type { PrivateUser } from '@services/users/types'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getTestIneligiblePurchaseReversalCase } from '@voucha/test-helpers/entities/memberships-reversals'
import { bindStripePurchaseCollisionReviewSeed } from '@voucha/test-helpers/stripe-purchase-collision-review-seed'
import { readTestStripePurchaseCollisionReview } from '@voucha/test-helpers/stripe-purchase-collision-work'
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'

const { restoreTestStripePurchaseCollisionReview, seedTestStripePurchaseCollisionReview } =
  bindStripePurchaseCollisionReviewSeed({
    getStripeMembershipSourceIdentity,
    createProviderMembershipSource,
    recordStripePurchaseCollisionReviews,
  })

const LIST = '/api/v1/admin/membership-stripe-purchase-collision-reviews'

describe('admin Stripe purchase collision reviews', () => {
  let admin: PrivateUser
  let member: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    member = await createTestUser()
  })

  it('requires an administrator', async () => {
    const request = createRequest()
    await request.get(LIST).expect(401)
    await request.authenticateAs(member)
    await request.get(LIST).expect(403)
    await request.get(`${LIST}/${randomUUID()}`).expect(403)
    await request.post(`${LIST}/${randomUUID()}/disposition`).send({}).expect(403)
  })

  it('returns one owned review and a following page that omits it', async () => {
    const seeded = await seedTestStripePurchaseCollisionReview()
    const request = createRequest()
    await request.authenticateAs(admin)
    const detail = await request.get(`${LIST}/${seeded.review.id}`).expect(200)
    expect(detail.body).toMatchObject({
      id: seeded.review.id,
      originating_invoice_id: seeded.invoiceId,
      winning_plan: 'plus',
    })
    const first = await request.get(LIST).query({ limit: 100 }).expect(200)
    expect(first.body.results.map((review: { id: string }) => review.id)).toContain(
      seeded.review.id,
    )
    const after = encodeScopedUuidCursor(
      seeded.review.id,
      'stripe-purchase-collision-reviews:id-desc',
    )
    const second = await request.get(LIST).query({ limit: 100, after }).expect(200)
    expect(second.body.results.map((review: { id: string }) => review.id)).not.toContain(
      seeded.review.id,
    )
    await request.get(LIST).query({ after: 'not-a-cursor' }).expect(400)
    await request.get(LIST).query({ limit: 0 }).expect(400)
    await request.get(`${LIST}/not-a-uuid`).expect(422)
  })

  it('clamps the page to the configured size', async () => {
    await seedTestStripePurchaseCollisionReview()
    await seedTestStripePurchaseCollisionReview()
    const restore = overrideDynamicConfigFieldsForTest(collisionReviewPageConfig, { page_size: 1 })
    try {
      const request = createRequest()
      await request.authenticateAs(admin)
      const page = await request.get(LIST).query({ limit: 50 }).expect(200)
      expect(page.body.results).toHaveLength(1)
      expect(page.body.page_info.has_next_page).toBe(true)
    } finally {
      restore()
    }
  })

  it('dismisses without an amount and keeps the review when the case already exists', async () => {
    const dismiss = await seedTestStripePurchaseCollisionReview()
    const conflict = await seedTestStripePurchaseCollisionReview()
    const request = createRequest()
    await request.authenticateAs(admin)
    const removed = await request
      .post(`${LIST}/${dismiss.review.id}/disposition`)
      .send({})
      .expect(200)
    expect(removed.body).toEqual({ disposed: true, reversal_case_created: false })
    await expect(
      readTestStripePurchaseCollisionReview(dismiss.sourceId, dismiss.invoiceId),
    ).resolves.toBeNull()
    const created = await request
      .post(`${LIST}/${conflict.review.id}/disposition`)
      .send(staffBody(conflict))
      .expect(200)
    expect(created.body).toEqual({ disposed: true, reversal_case_created: true })
    const restored = await restoreTestStripePurchaseCollisionReview(conflict)
    await request.post(`${LIST}/${restored.id}/disposition`).send(staffBody(conflict)).expect(409)
    await expect(
      readTestStripePurchaseCollisionReview(conflict.sourceId, conflict.invoiceId),
    ).resolves.toMatchObject({ id: restored.id })
    await expect(
      getTestIneligiblePurchaseReversalCase(conflict.subscriptionId, 'production'),
    ).resolves.toMatchObject({
      stripe_price_id: conflict.stripePriceId,
      currency_code: 'usd',
      refund_cap_minor_units: '900',
    })
  })

  it('returns 400 for a non-positive amount and leaves the review', async () => {
    const seeded = await seedTestStripePurchaseCollisionReview()
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .post(`${LIST}/${seeded.review.id}/disposition`)
      .send({ ...staffBody(seeded), amount: { amount: 0, currency: 'usd' } })
      .expect(400)
    await expect(
      readTestStripePurchaseCollisionReview(seeded.sourceId, seeded.invoiceId),
    ).resolves.toMatchObject({ id: seeded.review.id })
  })
})

function staffBody(seeded: Awaited<ReturnType<typeof seedTestStripePurchaseCollisionReview>>) {
  return {
    amount: { amount: 900, currency: 'usd' },
    stripe_price_id: seeded.stripePriceId,
    period_started_at: '2025-03-01T00:00:00.000Z',
    period_ends_at: '2025-04-01T00:00:00.000Z',
  }
}
