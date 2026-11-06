import { beginTransaction, write } from '@data-stores/psql'
import { getEarliestCapturedStripeCollisions } from '@services/memberships/ineligible-stripe-purchase-reversal/collision-resolution'
import { getExistingCapturedStripeSource } from '@services/stripe/membership-sync/captured-collision-source'
import type { StripeMembershipSourceIdentity } from '@services/memberships/create-types'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

type Fixture = {
  userId: string
  sourceIdentity: StripeMembershipSourceIdentity
  source: { id: string; lineageId: string; bindingId: string }
}

/** Dense ineligible family lanes prove earliest lookup does not scan unrelated pending facts. */
export async function runMembershipReversalCollisionFactScenarios(fixture: Fixture) {
  const oldAt = new Date(Date.UTC(new Date().getUTCFullYear() - 9, 0, 1))
  await seedPendingStripeCollisionFacts(fixture.source, oldAt)
  const source = {
    sourceId: fixture.source.id,
    lineageId: fixture.source.lineageId,
    bindingId: fixture.source.bindingId,
  }
  registerScenarioContract('membership-reversal-collision-earliest', {
    seededRows: { membership_stripe_purchase_collision_work_items: 4001 },
    expectations: [
      {
        kind: 'maxProcessedRows',
        relation: 'membership_stripe_purchase_collision_work_items',
        max: 8,
      },
    ],
  })
  await runAndCapture(
    'membership-reversal-collision-earliest',
    async () => {
      await using transaction = await beginTransaction()
      const collisions = await getEarliestCapturedStripeCollisions(
        source,
        ['plus', 'pro'],
        transaction,
      )
      if (collisions.size !== 2 || collisions.get('pro')?.winningSourceKind !== 'direct')
        throw new Error('Expected bounded qualifying lanes to ignore lower-tier family history')
      await transaction.rollback()
    },
    undefined,
    'getEarliestCapturedStripeCollisions',
  )
  registerScenarioContract('membership-reversal-collision-captured-source', {
    seededRows: { membership_stripe_purchase_collision_work_items: 4001 },
    expectations: [
      'membership_stripe_purchase_collision_work_items',
      'membership_sources',
      'membership_lineage_bindings',
      'membership_provider_lineages',
      'membership_provider_contexts',
    ].map(relation => ({
      kind: 'maxProcessedRows' as const,
      relation,
      max: relation === 'membership_stripe_purchase_collision_work_items' ? 4 : 2,
    })),
  })
  await runAndCapture(
    'membership-reversal-collision-captured-source',
    async () => {
      await using transaction = await beginTransaction()
      const captured = await getExistingCapturedStripeSource(
        {
          userId: fixture.userId,
          sourceIdentity: fixture.sourceIdentity,
          customerId: fixture.sourceIdentity.providerAccountId!,
          purchasePlan: 'pro',
        },
        transaction,
      )
      if (captured?.id !== fixture.source.id) throw new Error('Expected captured owner source')
      await transaction.rollback()
    },
    undefined,
    'getExistingCapturedStripeSource',
  )
}

export async function seedPendingStripeCollisionFacts(
  source: { id: string; lineageId: string; bindingId: string },
  oldAt: Date,
) {
  await write(
    `/* seedPendingStripeCollisionFacts */
    INSERT INTO membership_stripe_purchase_collision_work_items (
      membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
      winning_source_kind, winning_plan, collision_at
    ) SELECT $1, $2, $3, 'family', 'plus', $4::timestamptz + n * INTERVAL '1 second'
    FROM generate_series(1, 2000) n`,
    [source.id, source.lineageId, source.bindingId, oldAt],
  )
  await write(`/* analyzePendingStripeCollisionFacts */ ANALYZE
    membership_stripe_purchase_collision_work_items, membership_sources,
    membership_lineage_bindings, membership_provider_lineages, membership_provider_contexts`)
}
