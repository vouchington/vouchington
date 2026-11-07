import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import { randomUUID } from 'node:crypto'
import { createTestSku } from './entities/memberships.mts'
import { createTestUser } from './entities/users.mts'
import { readTestStripePurchaseCollisionReview } from './stripe-purchase-collision-work.mts'

type StripeReviewSourceIdentity = {
  provider: 'stripe'
  environment: 'test' | 'production'
  applicationId: string
  providerLineageId: string
  providerAccountId?: string | null
}

type CollisionReviewInvoice = {
  invoiceId: string
  invoiceLineCount: number
  mappedMembershipLineCount: number
  collision: {
    winningSourceKind: 'direct' | 'family'
    winningPlan: 'plus' | 'pro'
    collisionAt: Date
  }
}

type CollisionReviewWork = {
  id: string
  sourceId: string
  lineageId: string
  bindingId: string
  sourceIdentity: StripeReviewSourceIdentity
  winningSourceKind: 'direct' | 'family'
  winningPlan: 'plus' | 'pro'
  collisionAt: Date
}

type StripePurchaseCollisionReviewWriters = {
  getStripeMembershipSourceIdentity: (options: {
    stripeSubscriptionId: string
    providerApplicationId: string
    providerEnvironment: 'production'
    stripeCustomerId: string
  }) => StripeReviewSourceIdentity
  createProviderMembershipSource: (
    input: {
      userId: string
      sourceKind: 'direct'
      sourceIdentity: StripeReviewSourceIdentity
    },
    query: QueryExecutor,
  ) => Promise<{ id: string; lineageId: string; bindingId: string }>
  recordStripePurchaseCollisionReviews: (
    invoices: readonly CollisionReviewInvoice[],
    work: CollisionReviewWork,
    query: QueryExecutor,
  ) => Promise<void>
}

type SeededStripePurchaseCollisionReview = {
  review: NonNullable<Awaited<ReturnType<typeof readTestStripePurchaseCollisionReview>>>
  sourceId: string
  lineageId: string
  bindingId: string
  sourceIdentity: StripeReviewSourceIdentity
  invoiceId: string
  stripePriceId: string
  collisionAt: Date
  subscriptionId: string
}

/** Binds the production writers so this helper does not depend on the service package. */
export function bindStripePurchaseCollisionReviewSeed(
  writers: StripePurchaseCollisionReviewWriters,
) {
  return {
    seedTestStripePurchaseCollisionReview: (invoiceId?: string) => seedReview(writers, invoiceId),
    restoreTestStripePurchaseCollisionReview: (seeded: SeededStripePurchaseCollisionReview) =>
      restoreReview(writers, seeded),
  }
}

async function seedReview(
  writers: StripePurchaseCollisionReviewWriters,
  invoiceId = `in_${randomUUID()}`,
): Promise<SeededStripePurchaseCollisionReview> {
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
  const sourceIdentity = writers.getStripeMembershipSourceIdentity({
    stripeSubscriptionId: `sub_${randomUUID()}`,
    providerApplicationId: applicationId,
    providerEnvironment: 'production',
    stripeCustomerId: `cus_${randomUUID()}`,
  })
  const collisionAt = new Date('2025-03-01T00:00:00.000Z')
  await using transaction = await beginTransaction()
  const source = await writers.createProviderMembershipSource(
    { userId: user.id, sourceKind: 'direct', sourceIdentity },
    transaction,
  )
  await writers.recordStripePurchaseCollisionReviews(
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

async function restoreReview(
  writers: StripePurchaseCollisionReviewWriters,
  seeded: SeededStripePurchaseCollisionReview,
) {
  await using transaction = await beginTransaction()
  await writers.recordStripePurchaseCollisionReviews(
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
