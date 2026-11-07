import { beginTransaction, read, write } from '@data-stores/psql'
import { applyStripePurchaseCollisionReviewDisposition } from '@services/memberships/ineligible-stripe-purchase-reversal/collision-review-disposition'
import {
  collisionReviewPageConfig,
  getStripePurchaseCollisionReview,
  listStripePurchaseCollisionReviews,
} from '@services/memberships/ineligible-stripe-purchase-reversal/collision-review-page'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

const STAFF_PRICE_ID = 'price_explain_staff_collision'
const PERIOD_STARTED_AT = new Date('2025-02-01T00:00:00.000Z')
const PERIOD_ENDS_AT = new Date('2025-03-01T00:00:00.000Z')
const REVIEW_INDEX = 'membership_stripe_purchase_collision_reviews_pkey'

/** Measures the staff list, detail, dismiss, and case-insert plans on the seeded reviews. */
export async function runMembershipReversalCollisionReviewStaffScenario(input: {
  lineageId: string
}): Promise<void> {
  await seedStaffPrice(input.lineageId)
  const reviewIds = await readReviewIds(input.lineageId)
  const [caseReviewId, deleteReviewId] = reviewIds
  if (!caseReviewId || !deleteReviewId) throw new Error('Expected two seeded collision reviews')

  registerScenarioContract('membership-reversal-collision-review-list', {
    expectations: [
      {
        kind: 'maxProcessedRows',
        relation: 'membership_stripe_purchase_collision_reviews',
        max: 101,
      },
      { kind: 'usesIndexes', indexes: [REVIEW_INDEX], noSort: true },
    ],
    seededRows: { membership_stripe_purchase_collision_reviews: 2_001 },
  })
  const previousPageSize = collisionReviewPageConfig.fields.get('page_size')
  collisionReviewPageConfig.fields.set('page_size', 100)
  try {
    await runAndCapture(
      'membership-reversal-collision-review-list',
      () => listStripePurchaseCollisionReviews({ limit: 100 }),
      undefined,
      'listStripePurchaseCollisionReviews',
    )
  } finally {
    restorePageSize(previousPageSize)
  }

  registerScenarioContract('membership-reversal-collision-review-get', {
    expectations: [
      {
        kind: 'maxProcessedRows',
        relation: 'membership_stripe_purchase_collision_reviews',
        max: 1,
      },
      { kind: 'usesIndexes', indexes: [REVIEW_INDEX], noSort: true },
    ],
    seededRows: { membership_stripe_purchase_collision_reviews: 2_001 },
  })
  await runAndCapture(
    'membership-reversal-collision-review-get',
    () => getStripePurchaseCollisionReview(caseReviewId),
    undefined,
    'getStripePurchaseCollisionReview',
  )

  registerScenarioContract('membership-reversal-collision-review-delete', {
    expectations: [
      {
        kind: 'maxProcessedRows',
        relation: 'membership_stripe_purchase_collision_reviews',
        max: 2,
      },
      { kind: 'usesIndexes', indexes: [REVIEW_INDEX], noSort: true },
    ],
    seededRows: { membership_stripe_purchase_collision_reviews: 2_001 },
  })
  await runAndCapture(
    'membership-reversal-collision-review-delete',
    async () => {
      await using transaction = await beginTransaction()
      await applyStripePurchaseCollisionReviewDisposition({ reviewId: deleteReviewId }, transaction)
      await transaction.rollback()
    },
    undefined,
    'deleteStripePurchaseCollisionReview',
  )

  registerScenarioContract('membership-reversal-collision-review-case', {
    expectations: [
      {
        kind: 'maxProcessedRows',
        relation: 'membership_stripe_purchase_collision_reviews',
        max: 1,
      },
      {
        kind: 'maxProcessedRows',
        relation: 'membership_ineligible_purchase_reversal_cases',
        max: 3,
      },
      { kind: 'maxProcessedRows', relation: 'membership_provider_products', max: 1 },
      { kind: 'maxProcessedRows', relation: 'membership_provider_lineages', max: 1 },
      {
        kind: 'usesIndexes',
        indexes: [
          REVIEW_INDEX,
          'idx_membership_provider_lineages__id_context',
          'idx_membership_provider_products__provider_identity',
        ],
      },
      // The explain custom plan probes existing cases on originating_invoice_id.
      // The unique lineage/invoice index is the other bounded probe.
      {
        kind: 'usesIndexes',
        indexes: [
          'idx_membership_ineligible_purchase_reversal_cases__invoice',
          'idx_membership_ineligible_purchase_reversal_cases__invoice_id',
        ],
        anyOf: true,
      },
    ],
    seededRows: {
      membership_stripe_purchase_collision_reviews: 2_001,
      membership_ineligible_purchase_reversal_cases: 2_001,
    },
  })
  await runAndCapture(
    'membership-reversal-collision-review-case',
    async () => {
      await using transaction = await beginTransaction()
      await applyStripePurchaseCollisionReviewDisposition(
        {
          reviewId: caseReviewId,
          amountMinorUnits: 2_500,
          stripePriceId: STAFF_PRICE_ID,
          currencyCode: 'usd',
          periodStartedAt: PERIOD_STARTED_AT,
          periodEndsAt: PERIOD_ENDS_AT,
        },
        transaction,
      )
      await transaction.rollback()
    },
    undefined,
    'insertStaffStripePurchaseCollisionReversalCase',
  )
}

async function seedStaffPrice(lineageId: string): Promise<void> {
  const { rows } = await write<{ id: string }>(
    `/* seedStaffCollisionReviewProduct */
     INSERT INTO membership_products (plan, billing_interval, retired_at)
     VALUES ('plus', 'monthly', CURRENT_TIMESTAMP) RETURNING id`,
  )
  const productId = rows[0]?.id
  if (!productId) throw new Error('Expected staff collision review product')
  await write(
    `/* seedStaffCollisionReviewPrice */
     INSERT INTO membership_provider_products (
       membership_product_id, membership_provider_context_id, provider_product_id,
       price_minor_units, currency_code
     )
     SELECT $2, lineage.membership_provider_context_id, $3, 500, 'usd'
     FROM membership_provider_lineages lineage
     WHERE lineage.id = $1`,
    [lineageId, productId, STAFF_PRICE_ID],
  )
  await write(
    `/* analyzeStaffCollisionReviewPrice */ ANALYZE membership_provider_products,
     membership_provider_lineages, membership_products, currencies`,
  )
}

async function readReviewIds(lineageId: string): Promise<string[]> {
  const { rows } = await read<{ id: string }>(
    `/* readStaffCollisionReviewIds */
     SELECT id FROM membership_stripe_purchase_collision_reviews
     WHERE membership_provider_lineage_id = $1
     ORDER BY id DESC
     LIMIT 2`,
    [lineageId],
  )
  return rows.map(row => row.id)
}

function restorePageSize(previous: unknown): void {
  if (typeof previous === 'number') collisionReviewPageConfig.fields.set('page_size', previous)
  else collisionReviewPageConfig.fields.delete('page_size')
}
