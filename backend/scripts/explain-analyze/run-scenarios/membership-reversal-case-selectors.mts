import { beginTransaction } from '@data-stores/psql'
import { mapWithConcurrency } from '@vouchington/utils/async'
import { buildGetDisplacedStripeSourceForCollisionQuery } from '@services/memberships/ineligible-stripe-purchase-reversal/collision-work'
import { buildGetStripeCollisionWinnerEffectiveAtQuery } from '@services/stripe/membership-sync/sync-or-create'
import {
  buildGetBoundStripeSubscriptionOwnerForCollisionQuery,
  buildGetWinningMembershipForStripePurchaseQuery,
  buildLockStripePurchaseOwnerForCollisionQuery,
} from '@services/stripe/membership-sync/captured-collision-source'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runMembershipReversalSelectorScenarios(
  userId: string,
  familyUserId: string,
  membershipId: string,
  sourceIdentity: {
    environment: 'test' | 'production'
    applicationId: string
    providerLineageId: string
  },
  customerId: string,
): Promise<void> {
  await mapWithConcurrency(
    [
      [
        'membership-reversal-displaced-source',
        'getDisplacedStripeSourceForCollision',
        async () => {
          await using transaction = await beginTransaction()
          const result = await transaction(buildGetDisplacedStripeSourceForCollisionQuery(userId))
          await transaction.rollback()
          return result
        },
      ],
      [
        'membership-reversal-winner-effective',
        'getStripeCollisionWinnerEffectiveAt',
        async () => {
          await using transaction = await beginTransaction()
          const result = await transaction(
            buildGetStripeCollisionWinnerEffectiveAtQuery(membershipId, userId),
          )
          await transaction.rollback()
          return result
        },
      ],
      [
        'membership-reversal-winning-membership',
        'getWinningMembershipForStripePurchase',
        async () => {
          await using transaction = await beginTransaction()
          const result = await transaction(
            buildGetWinningMembershipForStripePurchaseQuery(
              familyUserId,
              new Date(1_800_000_000_000),
            ),
          )
          await transaction.rollback()
          return result
        },
      ],
      [
        'membership-reversal-owner-lock',
        'detectIneligibleStripePurchaseFromInvoicePayment:lockUser',
        async () => {
          await using transaction = await beginTransaction()
          const result = await transaction(buildLockStripePurchaseOwnerForCollisionQuery(userId))
          await transaction.rollback()
          return result
        },
      ],
      [
        'membership-reversal-bound-owner',
        'getBoundStripeSubscriptionOwnerForCollision',
        async () => {
          await using transaction = await beginTransaction()
          const result = await transaction(
            buildGetBoundStripeSubscriptionOwnerForCollisionQuery(sourceIdentity, customerId),
          )
          await transaction.rollback()
          return result
        },
      ],
    ] as const,
    1,
    async ([scenario, label, execute]) => {
      registerScenarioContract(scenario, {
        seededRows: {
          users: 2002,
          memberships: 2002,
          membership_sources: 2002,
          membership_provider_lineages: 2002,
          membership_provider_contexts: 2002,
          membership_products: 2001,
        },
        expectations: [
          { kind: 'maxProcessedRows', relation: 'users', max: 2 },
          { kind: 'maxProcessedRows', relation: 'memberships', max: 2 },
          { kind: 'maxProcessedRows', relation: 'membership_sources', max: 2 },
          { kind: 'maxProcessedRows', relation: 'membership_lineage_bindings', max: 2 },
          { kind: 'maxProcessedRows', relation: 'membership_provider_lineages', max: 2 },
          { kind: 'maxProcessedRows', relation: 'membership_provider_contexts', max: 2 },
          { kind: 'maxProcessedRows', relation: 'membership_products', max: 2 },
        ],
      })
      await runAndCapture(
        scenario,
        async () => {
          const result = await execute()
          if (result.rows.length !== 1) throw new Error(`Expected one row for ${scenario}`)
        },
        undefined,
        label,
      )
    },
  )
}
