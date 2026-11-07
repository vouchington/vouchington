import { beginTransaction } from '@data-stores/psql'
import { getStripeMembershipSourceIdentity } from '@services/memberships/create-types'
import { recordStripePurchaseCollisionReviews } from '@services/memberships/ineligible-stripe-purchase-reversal/collision-review'
import { createProviderMembershipSource } from '@services/memberships/provider-source'
import { createTestSku } from '@voucha/test-helpers/entities/memberships'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import { readTestStripePurchaseCollisionReview } from '@voucha/test-helpers/stripe-purchase-collision-work'
import { randomUUID } from 'node:crypto'

/** Insert one ambiguous-invoice review whose lineage stores a priced Stripe product. */
export async function seedTestStripePurchaseCollisionReview(invoiceId = `in_${randomUUID()}`) {
  const user = await createTestUser()
  const applicationId = `collision-review-${randomUUID()}`
  const stripePriceId = `price_${randomUUID()}`
  await createTestSku({
    plan: 'plus',
    provider_application_id: applicationId,
    provider_environment: 'production',
    stripe_price_id: stripePriceId,
    currency_code: 'usd',
  })
  const sourceIdentity = getStripeMembershipSourceIdentity({
    stripeSubscriptionId: `sub_${randomUUID()}`,
    providerApplicationId: applicationId,
    providerEnvironment: 'production',
    stripeCustomerId: `cus_${randomUUID()}`,
  })
  const collisionAt = new Date('2025-03-01T00:00:00.000Z')
  await using transaction = await beginTransaction()
  const source = await createProviderMembershipSource(
    { userId: user.id, sourceKind: 'direct', sourceIdentity },
    transaction,
  )
  await recordStripePurchaseCollisionReviews(
    [
      {
        invoiceId,
        invoiceLineCount: 2,
        mappedMembershipLineCount: 1,
        collision: { winningSourceKind: 'direct', winningPlan: 'plus', collisionAt },
      },
    ],
    {
      id: randomUUID(),
      sourceId: source.id,
      lineageId: source.lineageId,
      bindingId: source.bindingId,
      sourceIdentity,
      winningSourceKind: 'direct',
      winningPlan: 'plus',
      collisionAt,
    },
    transaction,
  )
  await transaction.commit()
  const review = await readTestStripePurchaseCollisionReview(source.id, invoiceId)
  if (!review) throw new Error('Seeded Stripe purchase collision review was not readable')
  return {
    review,
    sourceId: source.id,
    lineageId: source.lineageId,
    bindingId: source.bindingId,
    sourceIdentity,
    invoiceId,
    stripePriceId,
    collisionAt,
    subscriptionId: sourceIdentity.providerLineageId,
  }
}

/** Put back a review after disposition so a later amount sees the existing case. */
export async function restoreTestStripePurchaseCollisionReview(
  seeded: Awaited<ReturnType<typeof seedTestStripePurchaseCollisionReview>>,
) {
  await using transaction = await beginTransaction()
  await recordStripePurchaseCollisionReviews(
    [
      {
        invoiceId: seeded.invoiceId,
        invoiceLineCount: seeded.review.invoice_line_count,
        mappedMembershipLineCount: seeded.review.mapped_membership_line_count,
        collision: {
          winningSourceKind: seeded.review.winning_source_kind,
          winningPlan: seeded.review.winning_plan,
          collisionAt: seeded.collisionAt,
        },
      },
    ],
    {
      id: randomUUID(),
      sourceId: seeded.sourceId,
      lineageId: seeded.lineageId,
      bindingId: seeded.bindingId,
      sourceIdentity: seeded.sourceIdentity,
      winningSourceKind: seeded.review.winning_source_kind,
      winningPlan: seeded.review.winning_plan,
      collisionAt: seeded.collisionAt,
    },
    transaction,
  )
  await transaction.commit()
  const review = await readTestStripePurchaseCollisionReview(seeded.sourceId, seeded.invoiceId)
  if (!review) throw new Error('Restored Stripe purchase collision review was not readable')
  return review
}
