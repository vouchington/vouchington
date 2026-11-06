import { runMembershipReversalCollisionFactScenarios } from './membership-reversal-collision-facts.mts'
import { seedMembershipReversalCollisionWorkNoise } from './membership-reversal-collision-noise.mts'
import { runMembershipReversalCollisionWorkScenarios } from './membership-reversal-collision-work.mts'
import { runMembershipReversalCollisionReviewScenario } from './membership-reversal-collision-review.mts'
import { seedMembershipReversalPlanNoise } from './membership-reversal-case-noise.mts'
import { runMembershipReversalSelectorScenarios } from './membership-reversal-case-selectors.mts'
import { randomUUID } from 'node:crypto'
import { runMembershipReversalReadScenarios } from './membership-reversal-case-reads.mts'
import { runMembershipReversalBindingScenarios } from './membership-reversal-case-bindings.mts'
import { beginTransaction, write } from '@data-stores/psql'
import type { StripeInvoiceWithAllPayments } from '../../../modules/stripe/invoices.mts'
import { mintUUIDv7 } from '@modules/utils/ids'
import { getStripeMembershipSourceIdentity } from '@services/memberships/create-types'
import { createProviderMembershipSource } from '@services/memberships/provider-source'
import { recordIneligibleStripePurchaseCaseForCollision } from '@services/memberships/ineligible-stripe-purchase-reversal/case-creation'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { seedLedgerOperations } from './payment-ledger-retention-seed.mts'

export async function runMembershipReversalCaseCreationScenario(): Promise<void> {
  const userId = mintUUIDv7()
  const suffix = randomUUID()
  const prefix = `mr${suffix.slice(0, 8)}`
  await seedMembershipReversalPlanNoise(prefix)
  await write(
    `/* seedReversalCaseReadUser */ INSERT INTO users (id, username) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [seedUser.id, seedUser.username],
  )
  await seedLedgerOperations({
    kind: 'ineligible_purchase_reversal',
    count: 2000,
    completedAgo: '2 days',
    prefix: `reversal-plan-${suffix}`,
    caseCycle: 'open',
  })
  await write(
    `/* seedReversalCaseCreationUser */ INSERT INTO users (id, username) VALUES ($1, $2)`,
    [userId, `exrev-${suffix.slice(0, 8)}`],
  )
  const sourceIdentity = getStripeMembershipSourceIdentity({
    stripeSubscriptionId: `sub_explain_${suffix}`,
    providerEnvironment: 'test',
    providerApplicationId: `explain-reversal-${suffix}`,
    stripeCustomerId: `cus_${suffix}`,
  })
  await using sourceTransaction = await beginTransaction()
  const source = await createProviderMembershipSource(
    { userId, sourceKind: 'direct', sourceIdentity },
    sourceTransaction,
  )
  await sourceTransaction.commit()
  const familyUserId = mintUUIDv7()
  await write(`/* seedReversalWinnerUser */ INSERT INTO users (id, username) VALUES ($1, $2)`, [
    familyUserId,
    `exfam-${suffix.slice(0, 8)}`,
  ])
  await using familyTransaction = await beginTransaction()
  const family = await createProviderMembershipSource(
    {
      userId: familyUserId,
      sourceKind: 'family',
      sourceIdentity: { ...sourceIdentity, providerLineageId: `family_${suffix}` },
    },
    familyTransaction,
  )
  await familyTransaction.commit()
  const { rows: membershipRows } = await write<{ id: string; user_id: string }>(
    `/* seedReversalWinnerMemberships */
    WITH product AS (
      INSERT INTO membership_products (plan, billing_interval, retired_at)
      VALUES ('plus', 'monthly', CURRENT_TIMESTAMP) RETURNING id
    ) INSERT INTO memberships (user_id, membership_source_id, membership_product_id, effective_at)
      SELECT fixture.user_id, fixture.source_id, product.id, NOW() - INTERVAL '1 day'
      FROM product CROSS JOIN (VALUES ($1::uuid, $2::uuid), ($3::uuid, $4::uuid)) fixture(user_id, source_id)
      RETURNING id, user_id`,
    [userId, source.id, familyUserId, family.id],
  )
  const membershipId = membershipRows.find(row => row.user_id === userId)?.id
  if (!membershipId) throw new Error('Expected seeded Stripe membership')

  const invoice = {
    id: `in_explain_${suffix}`,
    created: 1_800_000_000,
    currency: 'usd',
    status: 'paid',
    total: 1001,
    period_start: 1_800_000_000,
    period_end: 1_800_086_400,
    lines: {
      data: [
        {
          currency: 'usd',
          pricing: { price_details: { price: `price_${suffix}` } },
          period: { start: 1_800_000_000, end: 1_800_086_400 },
        },
      ],
    },
    payments: {
      data: [{ amount_paid: 1001, payment: { type: 'charge', charge: `ch_${suffix}` } }],
    },
  } as unknown as StripeInvoiceWithAllPayments
  registerScenarioContract('membership-reversal-case-creation', {
    expectations: [
      {
        kind: 'maxProcessedRows',
        relation: 'membership_ineligible_purchase_reversal_cases',
        max: 2,
      },
    ],
  })
  await runAndCapture(
    'membership-reversal-case-creation',
    async () => {
      await using transaction = await beginTransaction()
      const created = await recordIneligibleStripePurchaseCaseForCollision(
        {
          userId,
          sourceIdentity,
          invoice,
          stripePriceId: `price_${suffix}`,
          winningSourceKind: 'family',
          collisionAt: new Date(1_800_043_200_000),
        },
        transaction,
      )
      if (!created) throw new Error('Expected a new reversal case')
      await transaction.rollback()
    },
    undefined,
    'recordIneligibleStripePurchaseCaseForCollision',
  )
  await using caseTransaction = await beginTransaction()
  await recordIneligibleStripePurchaseCaseForCollision(
    {
      userId,
      sourceIdentity,
      invoice,
      stripePriceId: `price_${suffix}`,
      winningSourceKind: 'family',
      collisionAt: new Date(1_800_043_200_000),
    },
    caseTransaction,
  )
  await caseTransaction.commit()
  await write('/* analyzeReversalCaseRead */ ANALYZE membership_ineligible_purchase_reversal_cases')
  await write('/* analyzeReversalBindingRead */ ANALYZE membership_lineage_bindings')
  await write('/* analyzeReversalLineageRead */ ANALYZE membership_provider_lineages')
  await write('/* analyzeReversalContextRead */ ANALYZE membership_provider_contexts')
  const lookup = {
    originatingInvoiceId: invoice.id,
    providerEnvironment: 'test' as const,
    providerApplicationId: sourceIdentity.applicationId,
    subscriptionId: sourceIdentity.providerLineageId,
  }
  await runMembershipReversalReadScenarios(lookup)
  await runMembershipReversalBindingScenarios({
    userId,
    sourceIdentity,
    invoice,
    stripePriceId: `price_${suffix}`,
    winningSourceKind: 'family',
    collisionAt: new Date(1_800_043_200_000),
  })
  await runMembershipReversalSelectorScenarios(
    userId,
    familyUserId,
    membershipId,
    sourceIdentity,
    `cus_${suffix}`,
  )
  const target = await seedMembershipReversalCollisionWorkNoise({ prefix, source, sourceIdentity })
  await runMembershipReversalCollisionWorkScenarios({ userId, source, sourceIdentity, target })
  await runMembershipReversalCollisionReviewScenario({ source, sourceIdentity, target })
  await runMembershipReversalCollisionFactScenarios({ userId, source, sourceIdentity })
}
