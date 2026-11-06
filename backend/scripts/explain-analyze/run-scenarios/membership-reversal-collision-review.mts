import { beginTransaction, write } from '@data-stores/psql'
import { recordStripePurchaseCollisionReviews } from '@services/memberships/ineligible-stripe-purchase-reversal/collision-review'
import type { StripePurchaseCollisionWork } from '@services/memberships/ineligible-stripe-purchase-reversal/collision-work'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runMembershipReversalCollisionReviewScenario(input: {
  source: { id: string; lineageId: string; bindingId: string }
  sourceIdentity: StripePurchaseCollisionWork['sourceIdentity']
  target: { workId: string }
}): Promise<void> {
  const collisionAt = new Date('2025-02-01T00:00:00.000Z')
  const work: StripePurchaseCollisionWork = {
    id: input.target.workId,
    sourceId: input.source.id,
    lineageId: input.source.lineageId,
    bindingId: input.source.bindingId,
    sourceIdentity: input.sourceIdentity,
    winningSourceKind: 'direct',
    winningPlan: 'plus',
    collisionAt,
  }
  const invoice = {
    invoiceId: 'in_explain_collision_review_replay',
    invoiceLineCount: 2,
    mappedMembershipLineCount: 1,
    collision: {
      winningSourceKind: 'direct' as const,
      winningPlan: 'plus' as const,
      collisionAt,
    },
  }

  await write(
    `/* seedStripePurchaseCollisionReviewNoise */
     INSERT INTO membership_stripe_purchase_collision_reviews (
       membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
       originating_invoice_id, winning_source_kind, winning_plan, collision_at,
       invoice_line_count, mapped_membership_line_count
     )
     SELECT $1, $2, $3, 'in_explain_collision_review_noise_' || ordinal,
       'direct', 'plus', $4, 2, 1
     FROM generate_series(1, 2_000) AS noise(ordinal)
     ON CONFLICT (membership_provider_lineage_id, originating_invoice_id) DO NOTHING`,
    [input.source.id, input.source.lineageId, input.source.bindingId, collisionAt],
  )
  await write(
    `/* seedStripePurchaseCollisionReviewReplay */
     INSERT INTO membership_stripe_purchase_collision_reviews (
       membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
       originating_invoice_id, winning_source_kind, winning_plan, collision_at,
       invoice_line_count, mapped_membership_line_count
     ) VALUES ($1, $2, $3, $4, 'direct', 'plus', $5, 2, 1)
     ON CONFLICT (membership_provider_lineage_id, originating_invoice_id) DO NOTHING`,
    [
      input.source.id,
      input.source.lineageId,
      input.source.bindingId,
      invoice.invoiceId,
      collisionAt,
    ],
  )
  await write(
    '/* analyzeStripePurchaseCollisionReviews */ ANALYZE membership_stripe_purchase_collision_reviews',
  )

  registerScenarioContract('membership-reversal-collision-review-insert', {
    allowEmptyResult: true,
    expectations: [
      {
        kind: 'maxProcessedRows',
        relation: 'membership_stripe_purchase_collision_reviews',
        max: 2,
      },
    ],
    seededRows: { membership_stripe_purchase_collision_reviews: 2_001 },
  })
  await runAndCapture(
    'membership-reversal-collision-review-insert',
    async () => {
      await using transaction = await beginTransaction()
      await recordStripePurchaseCollisionReviews(
        [{ ...invoice, invoiceId: 'in_explain_collision_review_insert' }],
        work,
        transaction,
      )
      await transaction.rollback()
    },
    undefined,
    'recordStripePurchaseCollisionReviews',
  )

  registerScenarioContract('membership-reversal-collision-review-replay', {
    allowEmptyResult: true,
    expectations: [
      {
        kind: 'maxProcessedRows',
        relation: 'membership_stripe_purchase_collision_reviews',
        max: 2,
      },
    ],
    seededRows: { membership_stripe_purchase_collision_reviews: 2_001 },
  })
  await runAndCapture(
    'membership-reversal-collision-review-replay',
    () => recordStripePurchaseCollisionReviews([invoice], work, write),
    undefined,
    'recordStripePurchaseCollisionReviews',
  )
}
