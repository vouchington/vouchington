import { beginTransaction } from '@data-stores/psql'
import type { StripeInvoiceWithAllPayments } from '../../../modules/stripe/invoices.mts'
import {
  completeStripePurchaseCollisionWork,
  findStripePurchaseCollisionWorkIds,
  findStripePurchaseCollisionWorkUpperBound,
  loadStripePurchaseCollisionWork,
  recordIneligibleStripePurchaseCollisionWork,
} from '@services/memberships/ineligible-stripe-purchase-reversal/collision-work'
import { getStripePurchaseCollisionPlans } from '@services/memberships/ineligible-stripe-purchase-reversal/collision-catalog'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

type Fixture = {
  userId: string
  sourceIdentity: {
    provider: 'stripe'
    environment: 'test' | 'production'
    applicationId: string
    providerLineageId: string
    providerAccountId?: string | null
  }
  source: { id: string; lineageId: string; bindingId: string }
  target: { workId: string; priceId: string; productId: string }
}

const seededRows = {
  membership_stripe_purchase_collision_work_items: 2_001,
  membership_provider_products: 2_001,
  membership_products: 4_002,
  membership_sources: 2_002,
  membership_provider_lineages: 2_002,
  membership_provider_contexts: 2_001,
  membership_lineage_bindings: 2_001,
}

export async function runMembershipReversalCollisionWorkScenarios(fixture: Fixture): Promise<void> {
  const insertCollisionAt = new Date('2030-01-01T00:00:00.000Z')
  const collision = {
    userId: fixture.userId,
    sourceIdentity: fixture.sourceIdentity,
    winningSourceKind: 'direct' as const,
    winningPlan: 'plus' as const,
    collisionAt: insertCollisionAt,
  }
  const through = await findStripePurchaseCollisionWorkUpperBound()
  if (!through) throw new Error('Expected seeded collision work upper bound')
  const invoice = {
    lines: {
      data: [{ pricing: { price_details: { price: fixture.target.priceId } } }],
    },
  } as unknown as StripeInvoiceWithAllPayments

  await capture(
    'membership-reversal-collision-work-insert',
    'recordIneligibleStripePurchaseCollisionWork',
    ['membership_stripe_purchase_collision_work_items', 2],
    async () => {
      await using transaction = await beginTransaction()
      const id = await recordIneligibleStripePurchaseCollisionWork(collision, transaction)
      if (!id) throw new Error('Expected collision work insert')
      await transaction.rollback()
    },
  )
  await capture(
    'membership-reversal-collision-work-existing',
    'getExistingStripePurchaseCollisionWork',
    ['membership_stripe_purchase_collision_work_items', 2],
    async () => {
      await using transaction = await beginTransaction()
      const replay = await recordIneligibleStripePurchaseCollisionWork(
        { ...collision, collisionAt: new Date('2025-02-01T00:00:00.000Z') },
        transaction,
      )
      if (replay !== fixture.target.workId) throw new Error('Expected existing work replay')
      await transaction.rollback()
    },
  )
  await capture(
    'membership-reversal-collision-work-load',
    'loadStripePurchaseCollisionWork',
    ['membership_stripe_purchase_collision_work_items', 2],
    async () => {
      if (!(await loadStripePurchaseCollisionWork(fixture.target.workId)))
        throw new Error('Expected owned collision work')
    },
    [
      ['membership_provider_lineages', 2],
      ['membership_provider_contexts', 2],
    ],
  )
  await capture(
    'membership-reversal-collision-work-upper-bound',
    'findStripePurchaseCollisionWorkUpperBound',
    ['membership_stripe_purchase_collision_work_items', 2],
    async () => {
      if (!(await findStripePurchaseCollisionWorkUpperBound()))
        throw new Error('Expected collision work upper bound')
    },
  )
  await capture(
    'membership-reversal-collision-work-page',
    'findStripePurchaseCollisionWorkIds',
    ['membership_stripe_purchase_collision_work_items', 50],
    async () => {
      const ids = await findStripePurchaseCollisionWorkIds({ through, limit: 25 })
      if (ids.length !== 25) throw new Error('Expected a 25-row collision work page')
    },
  )
  await capture(
    'membership-reversal-collision-work-complete',
    'completeStripePurchaseCollisionWork',
    ['membership_stripe_purchase_collision_work_items', 2],
    async () => {
      await using transaction = await beginTransaction()
      await completeStripePurchaseCollisionWork(fixture.target.workId, transaction)
      await transaction.rollback()
    },
    [],
    true,
  )
  await capture(
    'membership-reversal-collision-catalog',
    'getStripePurchaseCollisionPlans',
    ['membership_provider_products', 2],
    async () => {
      const plans = await getStripePurchaseCollisionPlans(
        { sourceId: fixture.source.id, lineageId: fixture.source.lineageId },
        [invoice],
      )
      if (plans.get(fixture.target.priceId) !== 'plus')
        throw new Error('Expected collision Stripe price to resolve through its retained source')
    },
    [
      ['membership_products', 2],
      ['membership_sources', 2],
      ['membership_provider_lineages', 2],
    ],
  )
}

async function capture(
  scenario: string,
  queryName: string,
  [primaryRelation, primaryMax]: [string, number],
  callback: () => Promise<void>,
  additional: [string, number][] = [],
  allowEmptyResult = false,
): Promise<void> {
  registerScenarioContract(scenario, {
    seededRows,
    allowEmptyResult,
    expectations: [primaryRelation, ...additional.map(([relation]) => relation)].map(
      (relation, index) => ({
        kind: 'maxProcessedRows' as const,
        relation,
        max: index === 0 ? primaryMax : additional[index - 1]![1],
      }),
    ),
  })
  await runAndCapture(scenario, callback, undefined, queryName)
}
